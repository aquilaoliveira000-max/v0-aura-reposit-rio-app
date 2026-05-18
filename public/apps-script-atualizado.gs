const ROOT_FOLDER_NAME = "Uploads +Aura"

function doGet(e) {
  try {
    const folderPath = e.parameter.folderPath || ''
    const folder = navigateToFolder(folderPath)
    if (!folder) return jsonResponse({ success: false, error: 'Pasta não encontrada' })

    const folders = []
    const foldersIt = folder.getFolders()
    while (foldersIt.hasNext()) {
      const f = foldersIt.next()
      folders.push({ id: f.getId(), name: f.getName(), type: 'folder' })
    }

    const files = []
    const filesIt = folder.getFiles()
    while (filesIt.hasNext()) {
      const f = filesIt.next()
      files.push({
        id: f.getId(),
        name: f.getName(),
        type: 'file',
        mimeType: f.getMimeType(),
        size: f.getSize(),
        createdAt: f.getDateCreated().toISOString()
      })
    }

    return jsonResponse({ success: true, folders, files })
  } catch (err) {
    return jsonResponse({ success: false, error: err.message })
  }
}

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents)
    const action = payload.action || 'upload'

    if (action === 'upload') {
      const folder = navigateToFolder(payload.folderPath || '', true)
      const decoded = Utilities.base64Decode(payload.data)
      const blob = Utilities.newBlob(decoded, payload.mimeType || 'application/octet-stream', payload.fileName)
      const file = folder.createFile(blob)
      return jsonResponse({ success: true, id: file.getId(), name: file.getName() })
    }

    if (action === 'delete') {
      DriveApp.getFileById(payload.id).setTrashed(true)
      return jsonResponse({ success: true })
    }

    if (action === 'deleteFolder') {
      DriveApp.getFolderById(payload.id).setTrashed(true)
      return jsonResponse({ success: true })
    }

    if (action === 'createFolder') {
      const parent = navigateToFolder(payload.folderPath || '', true)
      const newFolder = parent.createFolder(payload.name)
      return jsonResponse({ success: true, id: newFolder.getId(), name: newFolder.getName() })
    }

    if (action === 'rename') {
      try {
        DriveApp.getFileById(payload.id).setName(payload.name)
      } catch {
        DriveApp.getFolderById(payload.id).setName(payload.name)
      }
      return jsonResponse({ success: true })
    }

    if (action === 'move') {
      const targetPath = payload.targetPath || ''
      const targetFolder = navigateToFolder(targetPath, true)
      
      // Tenta mover como arquivo primeiro
      try {
        const file = DriveApp.getFileById(payload.id)
        file.moveTo(targetFolder)
        return jsonResponse({ success: true })
      } catch (fileErr) {}
      
      // Se não for arquivo, tenta como pasta
      try {
        const folder = DriveApp.getFolderById(payload.id)
        // Folders não têm moveTo — usa add/remove manualmente
        const parents = folder.getParents()
        targetFolder.addFolder(folder)
        while (parents.hasNext()) {
          const parent = parents.next()
          if (parent.getId() !== targetFolder.getId()) {
            parent.removeFolder(folder)
          }
        }
        return jsonResponse({ success: true })
      } catch (folderErr) {
        return jsonResponse({ success: false, error: 'Não foi possível mover: ' + folderErr.message })
      }
    }

    return jsonResponse({ success: false, error: 'Ação desconhecida' })
  } catch (err) {
    return jsonResponse({ success: false, error: err.message })
  }
}

function navigateToFolder(path, create) {
  let current = getOrCreateFolder(ROOT_FOLDER_NAME)
  if (!path) return current
  const parts = path.split('/').filter(p => p.trim())
  for (const part of parts) {
    if (create) {
      current = getOrCreateSubFolder(current, part.trim())
    } else {
      const it = current.getFoldersByName(part.trim())
      if (!it.hasNext()) return null
      current = it.next()
    }
  }
  return current
}

function getOrCreateFolder(name) {
  const folders = DriveApp.getFoldersByName(name)
  return folders.hasNext() ? folders.next() : DriveApp.createFolder(name)
}

function getOrCreateSubFolder(parent, name) {
  const folders = parent.getFoldersByName(name)
  return folders.hasNext() ? folders.next() : parent.createFolder(name)
}

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON)
}
