import jQuery from 'jquery';
import { JSDOM } from 'jsdom';
import config from 'config';

export default jQuery( Object.assign( new JSDOM( '', { url: config.afc?.mwn?.apiUrl || 'about:blank' } ).window ), true );
