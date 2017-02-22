"use strict";

const tools = require('./searchtools.js');
var composers = require('./composers.json');
const log = false //turn on detailed logging

var classical = function(info){
    this.classic = false;
}

var strim = function(string){
    string = string.replace(/[\¬\`\¦\!\£\$\%\^\*\_\-\+\=\~\#\@\:\;\,\.\?\/\\\|\']/g,' ').replace(/\&/g,' and ');
    string = string.replace(/[\(\)\[\]\{\}\"\“\”\‘\’]/g,function(item){return ' '+item+' '});
    string = string.replace(/(?:^| )(mv|movement)[\s0-9]/g,function(m){return ' mvt '+m.replace(/[^0-9]/g,'')})
    string = tools.despace(string);
    return string;
}

//fix the metadata for classical music
classical.prototype.get = function(info){

    if(log) console.Yolk.say(info.metadata.artist+' :|: '+info.metadata.album+' :|: '+info.metadata.title);

    var self = this;
	var whole = '';
    var whole_album = '';
    var whole_title = '';
    info.classical={};

	['artist','album','title'].forEach(function(key){
		if(info.metadata[key]){
			info.metadata[key]=info.metadata[key].toLowerCase();
            //var opus = ['op.','op:','op-','op_'];
            //info.metadata[key] = info.metadata[key].replace(/(^| )opus |(^| )op |(^| )op.|(^| )op:|(^| )op-|(^| )op_/g,' op ').trim();
            info.metadata[key] = info.metadata[key].replace(/(?:^| )(op|opus)[\.\:\;\-\_\=\~\s0-9]/g,function(part){return " op "+part.replace(/[^0-9]/g,'')});
            info.metadata[key] = tools.despace(info.metadata[key])
            if(key === 'album') whole_album = strim(info.metadata[key]);
			if(key === 'title'){
				whole_title = strim(info.metadata[key]);
				whole = whole+whole_title;
			}else{
				whole = whole+strim(info.metadata[key])+' ';
			}
		}
	})

    if(log) console.Yolk.say(whole)

	var postfix = false;
	var all_composers = false;
	var all_composers2 = false;
	var all_composers3 = false;
	var gotnames=[];

	function testname(name,composer,whole3){
        var regex = new RegExp("(?:^| )"+name+"(?: |$)")
        if(whole3.search(regex) !== -1){
			if(typeof composers[composer] === 'string'){
                //get rid of ambiguous composer spelling
				composer = composers[composer];
			}
			if(!all_composers) all_composers={};
			if(!all_composers[composer]) all_composers[composer]=composers[composer];
			return true;
		}
		return false;
	}

    //get the original track artist if different to composer
    function putartist(composer){
        if(info.metadata.artist){
            var lastname = tools.strim(composer.split(' ').reverse()[0]);
            var artist = tools.strim(info.metadata.artist);
            //if(artist.indexOf(lastname)===-1){
                var artists = info.metadata.artist.split(/(?:[\/\,]| - | and | et | by | with | conductor )/g).map(function(artist){return artist.trim()}).filter(function(artist){
                    if(artist.length && artist.indexOf(lastname) === -1){return true}
                });
                if(artists.length) info.classical.artist = artists.map(function(artist){return {name:artist}})

            //}
        }
    }

    //get the composer name and details
	function getnames(whole2){
		all_composers = false;

        //check for match on full name first
		Object.keys(composers).forEach(function(composer){
			var lastname = composer.split(' ').reverse()[0];
			if(gotnames.indexOf(lastname)==-1){
				if(testname(composer,composer,whole2)){
					gotnames.push(lastname)
				}
			}
		})

        //then on initials and surname
		Object.keys(composers).forEach(function(composer){
			var lastname = composer.split(' ').reverse()[0];
			var init='';
			var split = composer.split(' ');
			split.forEach(function(part,index){
				if(index < split.length-1){
					init=init+part[0]+' '
				}else{
					init=init+part;
				}
			})
			if(gotnames.indexOf(lastname)==-1){
				if(testname(init,composer,whole2)){
					gotnames.push(lastname)
				}
			}
		})

        //then on surname only
		Object.keys(composers).forEach(function(composer){
			var lastname = composer.split(' ').reverse()[0];
			if(gotnames.indexOf(lastname)==-1){
				testname(lastname,composer,whole2)
			}
		})

        //reduce numerous composers to the most likely by album only then title
		if(all_composers){
			var keys = Object.keys(all_composers);
			if(keys.length === 1){ //only one composer, so happy days!
				info.classical.composer = keys[0];
                putartist(info.classical.composer)
			}else if(!info.retry||info.retry===1){
				if(!info.retry){ //more than one composer, so check the album name for the authoratative one
					all_composers2 = all_composers;
					info.retry = 1;
					if(info.metadata.album){
						getnames(whole_album);
					}else{
						info.retry = 2;
						getnames(whole_title);
					}
				}else{ //still more than one composer, so check the track title for the authoratative one
					all_composers3 = all_composers;
					info.retry = 2;
					getnames(whole_title);
				}
			}
		}
	}
	getnames(whole);
	delete info.retry;

    //check if there are work identifiers for the composer
	if(all_composers || all_composers2 || all_composers3){
		if(all_composers2) all_composers = all_composers2;
		if(all_composers3) all_composers = all_composers3;
		Object.keys(all_composers).some(function(composer){
			return all_composers[composer].some(function(cat){
                var ident = self.divider(whole,cat);
                if(ident=== 'too long'){
                    [whole_album+' '+whole_title,whole_title].some(function(string){
                        ident = self.divider(string,cat);
                        if(!ident || ident=== 'too long'){return false}
                        return true;
                    })
                }
				if(ident){
					info.classical.composer = composer;
                    putartist(info.classical.composer);
					info.classical.cat={
						id:cat,
						val:ident[0]
					};
                    if(log) console.Yolk.say(cat+' : '+composer+' : '+ident[0])
					postfix = true;
					return true;
				}
			});
		})
	}
    if(!info.classical.composer){
        if(log) console.Yolk.say('REJECTED ----------------- No composer found');
        if(log) console.Yolk.say('---------------------------------------------------------------------------------------------------------------------------------');
        return false;
    }
    if(log) console.Yolk.say(info.classical.composer)

	divider.forEach(function(div){
		var ident = self.divider(whole,div);
        if(ident=== 'too long'){
            ident = self.divider(whole_title,div);
            if(!ident || ident=== 'too long'){return false}
        }
		if(ident){
			if(div === 'op') {
				info.classical[div] = ident;
                if(log) console.Yolk.say('op : '+ident[0]+' - '+ident[1])
			}else if(div === 'in'){
                info.classical.key = ident;
                if(log) console.Yolk.say('key : '+ident[0]+' - '+ident[1]+' - '+ident[2])
            }else{
				if(!info.classical.types) info.classical.types = {};
				info.classical.types[div]=ident[0];
                if(div === 'mvt') info.classical.types.movement=ident[0];
                if(log) console.Yolk.say(div+' : '+ident[0])
			}
		}
	})
    if(!info.classical.types && !info.classical.op && !info.classical.cat && !info.classical.key){
        if(log) console.Yolk.say('REJECTED ----------------- Not enough information found');
        if(log) console.Yolk.say('---------------------------------------------------------------------------------------------------------------------------------');
        return false;
    }
    if(log) console.Yolk.say(info.classical);
    if(log) console.Yolk.say('---------------------------------------------------------------------------------------------------------------------------------');
    return info;
}

//find classical work number references from recording title
classical.prototype.divider = function(title,op){
	if(!title){return false};
	var self = this;

    //force a space between the identifier and trailing number
    var regex = new RegExp("(?:^| )"+op+"[0-9]",'g');
    var tofix = title.match(regex);
    if(tofix && tofix.length){
    	tofix.forEach(function(fix){
    		var fix2 = fix.replace(/[0-9]/,function(int){return ' '+int});
    		title = title.replace(fix,fix2)
    	})
    }
    //clean up numbers with leading characters
    title = title.replace(/[0-9][a-z]/g,function(foo){return foo.replace(/[a-z]/,'')})
    title = title.replace(/((?:^| )(no|number|num|nº|nr)[\s0-9])/g,function(match){return ' '+match.replace(/[^0-9]/g,'')});
    title = tools.despace(title);

    regex = new RegExp("(?:^| )"+op+" ",'g');
	if(title.search(regex)!==-1){
		var string = title.split(regex).filter(function(section){if(section.length){return true}});
        if(string.length > 2){return 'too long'}
		string = string[string.length-1];
        var brackets = ['{}','[]','()','“”','‘’','""'];
        brackets.forEach(function(bracket){
            var regex = new RegExp("\\"+bracket[0]+"(.*?)\\"+bracket[1],"g");
            string = string.replace(regex,'');
            string = tools.despace(string);
        })
        //if(log) console.Yolk.say(string);
        var rem = string.split(' ');
        if(op === 'in'){
            op1=[];
            if(rem[0].search(/^[a-g]$/)!==-1){
                op1.push(rem[0]);
                if(rem[1] && rem[1].search(/^(major|minor|flat|sharp)$/)!==-1){
                    op1.push(rem[1])
                }
                if(rem[2] && rem[2].search(/^(major|minor)$/)!==-1){
                    op1.push(rem[2])
                }
            }
            if(op1.length){return op1}
        }
        if(op === 'op'){rem = [rem[0],rem[1]]}else{rem = [rem[0]]};
        var op1 = tools.roman(rem);
        if(!op1[0]){return false}else{return op1}
	}
	return false;
}

var divider = ['act','symphony','sinfonía','symphonie','sinfonie','variation','variatio','sonata','sonate','triosonata','suite','concerto','ballade','balada','walzer','waltz','scherzo','poloneise','impromptu','mvt','op','in'];
module.exports = new classical();
