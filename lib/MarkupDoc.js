/*
	Meta PDF

	Copyright (c) 2018 Cédric Ronvel

	The MIT License (MIT)

	Permission is hereby granted, free of charge, to any person obtaining a copy
	of this software and associated documentation files (the "Software"), to deal
	in the Software without restriction, including without limitation the rights
	to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
	copies of the Software, and to permit persons to whom the Software is
	furnished to do so, subject to the following conditions:

	The above copyright notice and this permission notice shall be included in all
	copies or substantial portions of the Software.

	THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
	IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
	FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
	AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
	LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
	OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
	SOFTWARE.
*/

"use strict" ;



const NO_CHILD = [] ;



/*
	* layout: either "portrait" or "landscape"
	* pageSize: either an array [width,height] in PDF point (72 dpi) or a standard format string like "A4"
*/
function MarkupDoc() {
	this.nodes = null ;
}

module.exports = MarkupDoc ;



/*
	Parser
*/



MarkupDoc.parse = function parse( str , options ) {

	var markupDoc = new MarkupDoc( options ) ;

	var runtime = {
		i: 0 ,
		markupDoc: markupDoc ,
		depth: 0 ,
		ancestors: []
	} ;

	if ( typeof str !== 'string' ) {
		if ( str && typeof str === 'object' ) { str = str.toString() ; }
		else { throw new TypeError( "Argument #0 should be a string or an object with a .toString() method" ) ; }
	}

	markupDoc.nodes = parseNodes( str , runtime ) ;

	return markupDoc ;
} ;



function parseNodes( str , runtime ) {

	var nodes = [] , node , lastIndex ;

	while ( runtime.i < str.length ) {

		if ( str[ runtime.i ] === '<' ) {

			runtime.i ++ ;

			node = parseTagNode( str , runtime ) ;

			// If false, this is the end of this level, if null, do not add any tag
			if ( ! node ) { break ; }
			else { nodes.push( node ) ; }
		}
		else {
			node = parseStringNode( str , runtime ) ;
			if ( node ) { nodes.push( node ) ; }
		}
	}

	// White-space filtering (removing meaningless white-space)
	if ( ! runtime.depth || ! runtime.ancestors[ runtime.depth - 1 ].inline ) {
		// The parent node is a block node, so we remove all formatting white-spaces
		lastIndex = nodes.length - 1 ;

		nodes = nodes.filter( ( node_ , index ) => {
			if ( node_.type !== '_text' ) { return true ; }

			if ( ! index || ! nodes[ index - 1 ].inline ) {
				node_.text = node_.text.trimLeft() ;
			}

			if ( index === lastIndex || ! nodes[ index + 1 ].inline ) {
				node_.text = node_.text.trimRight() ;
			}

			return !! node_.text ;
		} ) ;
	}

	return nodes ;
}



function parseStringNode( str , runtime ) {

	var c , text = '' ;

	while ( runtime.i < str.length ) {
		c = str[ runtime.i ] ;

		if ( c === '<' ) {
			break ;
		}
		else if ( c === '&' ) {
			text += parseHtmlEntity( str , runtime ) ;
		}
		else {
			text += parseRawString( str , runtime ) ;
		}
	}

	// Remove all newline and controle chars
	// White chars streak are reduced to one space
	text = text.replace( /[\x00-\x1f ]+/gm , ' ' ) ;

	return { type: '_text' , text: text } ;
}



function parseRawString( str , runtime ) {
	var c , start = runtime.i ;

	for ( ; runtime.i < str.length ; runtime.i ++ ) {
		c = str[ runtime.i ] ;

		if ( c === '<' || c === '&' ) {
			break ;
		}
	}

	return str.slice( start , runtime.i ) ;
}



function parseHtmlEntity( str , runtime ) {

	// TODO...

	runtime.i ++ ;
	return '' ;
}



function parseTagNode( str , runtime ) {
	var arg , isClosingTag , isSelfClosing ;

	var tag = {
		parent: runtime.depth ? runtime.ancestors[ runtime.depth - 1 ] : null ,
		previousSibling: runtime.ancestors[ runtime.depth ] || null ,
		nextSibling: null ,
		inline: false ,
		attributes: {} ,
		classes: {}
	} ;

	if ( tag.previousSibling ) {
		tag.previousSibling.nextSibling = tag ;
	}

	if ( str[ runtime.i ] === '/' ) {
		runtime.i ++ ;
		isClosingTag = true ;
	}

	tag.type = parseTagName( str , runtime ) ;
	if ( isInlineTag[ tag.type ] ) { tag.inline = true ; }

	[ arg , isSelfClosing ] = parseTagArg( str , runtime ) ;	// it eats the final > too

	if ( arg ) {
		parseTagAttributes( tag , arg ) ;
	}

	if ( isClosingTag ) {
		return false ;
	}

	runtime.ancestors[ runtime.depth ] = tag ;

	if ( isSelfClosing ) {
		tag.children = NO_CHILD ;
	}
	else {
		runtime.depth ++ ;
		tag.children = parseNodes( str , runtime ) ;
		runtime.depth -- ;
	}

	return tag ;
}



var isInlineTag = {
	"i": true ,
	"em": true ,
	"u": true ,
	"b": true ,
	"strong": true ,
	"a": true
	//"img": true	// For instance, pdfkit does not support inline image at all
} ;



function parseTagName( str , runtime ) {
	var c , start = runtime.i ;

	for ( ; runtime.i < str.length ; runtime.i ++ ) {
		c = str.charCodeAt( runtime.i ) ;

		if (
			( c < 0x41 || c > 0x5a ) &&	// uppercase letters
			( c < 0x61 || c > 0x7a ) &&	// lowercase letters
			( c < 0x30 || c > 0x39 )	// numbers
		) {
			break ;
		}
	}

	return str.slice( start , runtime.i ).toLowerCase() ;
}



function parseTagArg( str , runtime ) {
	var c , arg = '' , isSelfClosing = false ;

	while ( runtime.i < str.length ) {
		c = str[ runtime.i ] ;

		if ( c === '/' && str[ runtime.i + 1 ] === '>' ) {
			isSelfClosing = true ;
			runtime.i += 2 ;
			break ;
		}
		else if ( c === '>' ) {
			runtime.i ++ ;
			break ;
		}
		else {
			arg += parseRawArg( str , runtime ) ;
		}
	}

	return [ arg.trim() , isSelfClosing ] ;
}



function parseRawArg( str , runtime ) {
	var c , start = runtime.i ;

	for ( ; runtime.i < str.length ; runtime.i ++ ) {
		c = str[ runtime.i ] ;

		if ( c === '>' || ( c === '/' && str[ runtime.i + 1 ] === '>' ) ) {
			break ;
		}
	}

	return str.slice( start , runtime.i ) ;
}



var attrRegexp = /([0-9A-Za-z_-]+)="([^"<>]*)"/g ;



function parseTagAttributes( tag , str ) {
	var matches ;

	attrRegexp.lastIndex = 0 ;

	while ( ( matches = attrRegexp.exec( str ) ) !== null ) {
		tag.attributes[ matches[ 1 ] ] = matches[ 2 ] ;
	}

	if ( tag.attributes.class ) {
		tag.attributes.class.split( / +/g ).forEach( className => tag.classes[ className ] = true ) ;
	}
}



/*
function parseSkipSpace( str , runtime ) {
	while ( runtime.i < str.length && str[ runtime.i ] === ' ' ) { runtime.i ++ ; }
}
*/

