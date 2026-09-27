function readBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read this photo."));
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.readAsDataURL(blob);
  });
}

export async function uploadFile(file, call, chunkBytes) {
  if (!chunkBytes || file.size <= chunkBytes)
    return call("upload_photo", { fileName: file.name, base64: await readBase64(file) });
  const parts = Math.ceil(file.size / chunkBytes);
  let uploadId;
  let result;
  for (let part = 0; part < parts; part++) {
    const base64 = await readBase64(file.slice(part * chunkBytes, (part + 1) * chunkBytes));
    result = await call("upload_photo", { fileName: file.name, base64, uploadId, part, parts });
    uploadId = result.uploadId;
  }
  return result;
}
