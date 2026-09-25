import test from 'node:test';
import assert from 'node:assert/strict';
import { validateFile, MAX_FILE_BYTES } from '../supabase/functions/_shared/file-validation.ts';
test('attachment validation rejects spoofed extensions, binary text and oversized files',()=>{
 const text=new TextEncoder().encode('Hello, friend!');
 assert.equal(validateFile(text,'hello.txt').mime,'text/plain');
 assert.throws(()=>validateFile(text,'photo.jpg'),/Supported files/);
 assert.throws(()=>validateFile(new Uint8Array([0,1]),'hello.txt'),/Supported files/);
 assert.throws(()=>validateFile(new Uint8Array(MAX_FILE_BYTES+1),'large.pdf'),/10 MB/);
 assert.equal(validateFile(new Uint8Array([255,216,255,0]),'photo.jpeg').mime,'image/jpeg');
 assert.equal(validateFile(text,'../hello.txt').name,'.._hello.txt');
});
