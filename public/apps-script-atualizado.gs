// COLE ESTE CÓDIGO NO APPS SCRIPT E REIMPLANTE
function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents)
    
    let folder = getOrCreateFolder("Uploads +Aura")
    
    if (payload.folderPath) {
      const parts = payload.folderPath.split('/')
      for (const part of parts) {
        if (part.trim()) folder = getOrCreateSubFolder(folder, part.trim())
      }
    }

    const decoded = Utilities.base64Decode(payload.data)
    const blob = Utilities.newBlob(decoded, payload.mimeType || 'application/octet-stream', payload.fileName)
    folder.createFile(blob)

    return ContentService
      .createTextOutput(JSON.stringify({ success: true }))
      .setMimeType(ContentService.MimeType.JSON)
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: err.message }))
      .setMimeType(ContentService.MimeType.JSON)
  }
}

function getOrCreateFolder(name) {
  const folders = DriveApp.getFoldersByName(name)
  return folders.hasNext() ? folders.next() : DriveApp.createFolder(name)
}

function getOrCreateSubFolder(parent, name) {
  const folders = parent.getFoldersByName(name)
  return folders.hasNext() ? folders.next() : parent.createFolder(name)
}
