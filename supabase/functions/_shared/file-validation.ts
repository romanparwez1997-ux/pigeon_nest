export const MAX_FILE_BYTES=10*1024*1024;
export function validateFile(bytes: Uint8Array, original: string) {
 if(!bytes.length || bytes.length>MAX_FILE_BYTES) throw new Error('Choose a file up to 10 MB.');
 const name=original.replace(/[\x00-\x1f\x7f/\\]/g,'_').trim().slice(0,120);
 if(!name) throw new Error('A filename is required.');
 const ext=name.split('.').pop()?.toLowerCase();
 const starts=(hex:number[])=>hex.every((b,i)=>bytes[i]===b);
 let mime='';
 if(['jpg','jpeg'].includes(ext||'')&&starts([255,216,255])) mime='image/jpeg';
 if(ext==='png'&&starts([137,80,78,71,13,10,26,10])) mime='image/png';
 if(ext==='webp'&&new TextDecoder().decode(bytes.slice(0,4))==='RIFF'&&new TextDecoder().decode(bytes.slice(8,12))==='WEBP') mime='image/webp';
 if(ext==='pdf'&&starts([37,80,68,70,45])) mime='application/pdf';
 if(ext==='txt') { try { new TextDecoder('utf-8',{fatal:true}).decode(bytes); if(!bytes.includes(0)) mime='text/plain'; } catch { /* invalid text */ } }
 if(!mime) throw new Error('Supported files: JPG, PNG, WebP, PDF and UTF-8 TXT. The file contents must match its extension.');
 return {name,mime};
}
