import jQuery from 'jquery';
import { JSDOM } from 'jsdom';

export default jQuery( Object.assign( new JSDOM( '', { url: 'about:blank' } ).window ), true );
