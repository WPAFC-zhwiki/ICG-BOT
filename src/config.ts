export { default as default } from '../config/config';
export { ConfigTS } from '../config/type';
import { repository as Repository } from '../package.json';
export { version } from '../package.json';
export const repository = Repository.replace( /^git\+/, '' );
