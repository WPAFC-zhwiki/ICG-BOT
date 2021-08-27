import jQuery from 'jquery';
import { JSDOM } from 'jsdom';
import config from 'src/config';

export default jQuery( Object.assign( new JSDOM( '', { url: config.afc?.mwn?.apiUrl || 'about:blank' } ).window ), true );
