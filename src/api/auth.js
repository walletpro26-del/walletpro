import { auth } from '../firebase'
import {
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
} from 'firebase/auth'

export async function signIn(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email, password)
  return {
    success: true,
    uid: cred.user.uid,
    email: cred.user.email,
    name: cred.user.displayName || cred.user.email.split('@')[0],
  }
}

export async function signInWithGoogle() {
  const provider = new GoogleAuthProvider()
  const cred = await signInWithPopup(auth, provider)
  return {
    success: true,
    uid: cred.user.uid,
    email: cred.user.email,
    name: cred.user.displayName || cred.user.email.split('@')[0],
  }
}

export async function signOut() {
  await firebaseSignOut(auth)
}

export function onAuthChange(callback) {
  return onAuthStateChanged(auth, (user) => {
    if (user) {
      callback({
        loggedIn: true,
        uid: user.uid,
        email: user.email,
        name: user.displayName || user.email.split('@')[0],
      })
    } else {
      callback({ loggedIn: false, uid: null, email: '', name: '' })
    }
  })
}
