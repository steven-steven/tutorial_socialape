const { admin, db } = require('../util/admin');

const config = require('../util/config'); 
const firebase = require('firebase');
firebase.initializeApp(config);

const { validateSignupData, validateLoginData } = require('../util/validators');

exports.signup = (req, res)=>{
    const newUser = {
        email: req.body.email,
        password: req.body.password,
        confirmPassword: req.body.confirmPassword,
        handle: req.body.handle,
    }

    const { valid, errors } = validateSignupData(newUser);
    if(!valid) return res.status(400).json(errors);

    const noImg = 'no-img.png';

    let token, userId;
    db.doc(`/users/${newUser.handle}`).get()
        .then(doc=>{
            if(doc.exists){
                return Promise.reject(new Error("handle-already-in-use"));
            } else{
                return firebase.auth().createUserWithEmailAndPassword(newUser.email, newUser.password);
            }
        })
        .then(data=>{
            //user created. return to user JWT auth token
            userId = data.user.uid;
            return data.user.getIdToken();
        })
        .then(userToken => {
            token = userToken;
            //create document with handle
            const userCredentials = {
                handle: newUser.handle,
                email: newUser.email,
                createdAt: new Date().toISOString(),
                imageUrl: `https://firebasestorage.googleapis.com/v0/b/${config.storageBucket}/o/${noImg}?alt=media`,   //add img field
                userId
            };
            return db.doc(`/users/${newUser.handle}`).set(userCredentials); 
        })
        .then(()=>{
            return res.status(201).json({token});
        })
        .catch(err => {
            console.error(err);
            if(err.code === "auth/email-already-in-use"){
                return res.status(400).json({email: "Email is already in use"});
            } else if (err.message === "handle-already-in-use"){
                return res.status(400).json({ handle: 'Handle is already in use'});
            }
            return res.status(500).json({error: err.code});
        })

};

exports.login = (req, res)=>{
    const user = {
        email: req.body.email,
        password: req.body.password
    };

    const { valid, errors } = validateLoginData(user);
    if(!valid) return res.status(400).json(errors);

    firebase.auth().signInWithEmailAndPassword(user.email, user.password)
        .then(data=>{
            return data.user.getIdToken();
        })
        .then(userToken =>{
            return res.json({userToken});
        })
        .catch(err =>{
            console.error(err);
            if(err.code === "auth/wrong-password"){
                return res.status(403).json({ general: 'Wrong credentials, please try again'}); //403: unauthorized
            } else {
                return res.status(500).json({error: err.code});
            }
        })
};

exports.uploadImage = (req, res) => {
    const BusBoy = require('busboy');
    const path = require('path');
    const os = require('os');
    const fs = require('fs');

    const busboy = new BusBoy({ headers: req.headers });

    let imageFileName;
    let imageToBeUploaded = {};

    busboy.on('file', (fieldname, file, filename, encoding, mimetype) => {

        if(mimetype !== 'image/jpeg' && mimetype !== 'image/png') {
            return res.status(400).json({ error: 'Wrong file type submitted'  });
        }

        const imageExtention = filename.split('.')[filename.split('.').length -1];
        imageFileName = `${Math.round(Math.random()*100000000000)}.${imageExtention}`;
        const filepath = path.join(os.tmpdir(), imageFileName);
        imageToBeUploaded = {filepath, mimetype};
        //Create new file at given path, and copy/pipe our original file there.
        file.pipe(fs.createWriteStream(filepath));
    });
    busboy.on('finish', ()=>{
        //upload the new file to google cloud storage
        admin.storage().bucket().upload(imageToBeUploaded.filepath, {
            resumable: false,
            metadata: {
                metadata:{
                    contentType: imageToBeUploaded.mimetype
                }
            }
        })
        .then(()=>{
            const imageUrl = `https://firebasestorage.googleapis.com/v0/b/${config.storageBucket}/o/${imageFileName}?alt=media`;
            //add image url to user document
            //update specific fields in the document .update({field:value}). Create field if not exist
            return db.doc(`/users/${req.user.handle}`).update({ imageUrl });
        })
        .then(()=>{
            return res.json({message: 'Image uploaded successfully'});
        })
        .catch(err => {
            console.error(err);
            return res.status(500).json({error:error.code});
        });
    });

    busboy.end(req.rawBody);
}