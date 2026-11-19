import { promises as fs } from './fs.ts';
export const { readFile, writeFile, appendFile, mkdir, readdir, stat, lstat, unlink, rename, rm, copyFile, access, realpath } = fs;
export default fs;
