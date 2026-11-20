import { promises as fs } from './fs.ts';
export const { readFile, writeFile, appendFile, mkdir, mkdtemp, readdir, stat, lstat, unlink, rename, rm, rmdir, copyFile, access, realpath } = fs;
export default fs;
