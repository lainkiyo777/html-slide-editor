function normalizeRelativePath(value) {
  return String(value || '')
    .replaceAll('\\', '/')
    .split('/')
    .filter((part) => part && part !== '.')
    .join('/');
}

function getRelativePath(file) {
  return normalizeRelativePath(file?.webkitRelativePath || file?.name);
}

export function createFolderFileMap(fileList) {
  const entries = Array.from(fileList ?? [])
    .map((file) => ({ file, path: getRelativePath(file) }))
    .filter(({ path }) => path.length > 0);

  const firstSegments = new Set(entries.map(({ path }) => path.split('/')[0]));
  const hasSharedTopLevelDirectory = firstSegments.size === 1
    && entries.every(({ path }) => path.includes('/'));

  return new Map(entries.map(({ file, path }) => {
    const parts = path.split('/');
    const projectPath = hasSharedTopLevelDirectory ? parts.slice(1).join('/') : path;
    return [projectPath, file];
  }).filter(([path]) => path.length > 0));
}

export function findFolderEntry(fileMap, entryName = 'index.html') {
  return fileMap?.get(entryName) ?? null;
}
