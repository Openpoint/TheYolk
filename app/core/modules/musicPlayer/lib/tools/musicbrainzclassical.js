"use strict";

/*
Copyright 2017 Michael Jonker (http://openpoint.ie)
This file is part of The Yolk.
The Yolk is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
any later version.
The Yolk is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.
You should have received a copy of the GNU General Public License
along with The Yolk.  If not, see <http://www.gnu.org/licenses/>.
*/

const {ipcMain} = require('electron');
const message = process.Yolk.message;
const tools = require('./searchtools.js');
const db_index = process.Yolk.modules.musicPlayer.config.db_index.index;
const path = require('path');
const elastic = require(path.join(process.Yolk.root,'core/lib/elasticsearch.js'));
const log = false //turn on detailed logging
const kill = require('./killer.js');

var classical = function(info){
    this.classic = false;
}

classical.prototype.getClassical = function(){
    elastic.exists(db_index+'.classical').then(function(exists){
        if(exists) return;
        var composers = require('./composers.json');
        var body = [];
        Object.keys(composers).forEach(function(composer){
            body.push({index:{ _index:db_index, _type:'classical'}})
            if(typeof composers[composer] === 'string'){
                body.push({name:composer,alt:composers[composer]})
            }else{
                body.push({name:composer,codes:composers[composer]})
            }
        })
        elastic.client.bulk({body:body,refresh:true},function(err,data){
            if(err) console.Yolk.err(err);
        })
    });
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
	var self = this;
	var p = new Promise(function(resolve,reject){

		if(log) console.Yolk.say(info.metadata.artist+' :|: '+info.metadata.album+' :|: '+info.metadata.title);
		var whole = '';
	    var whole_album = '';
	    var whole_title = '';
	    var composers = {};
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
					whole+=whole_title;
				}else{
					whole+=strim(info.metadata[key])+' ';
				}
			}
		})

	    if(log) console.Yolk.say(whole)

		var postfix = false;
		var all_composers = false;
		var all_composers2 = false;
		var all_composers3 = false;
		var gotnames=[];

	    elastic.fetchAll({index:db_index,type:'classical',body:{query:{match:{name:{query:whole,operator:'or'}}}}}).then(function(data){
			kill.update('promises');
			if(kill.kill) return;
	        if(!data.length){
	            if(log) console.Yolk.say('REJECTED ----------------- No composer found');
	            if(log) console.Yolk.say('---------------------------------------------------------------------------------------------------------------------------------');
				delete info.classical;
				info.isclassic = 'no';
				resolve(info);
	            return;
	        }
	        data.forEach(function(composer){
	            if(composer.alt) composers[composer.name] = composer.alt;
	            if(composer.codes) composers[composer.name] = composer.codes;
	        })
	        getnames(whole);
	        delete info.retry;
	        //check if there are work identifiers for the composer
	    	if(all_composers || all_composers2 || all_composers3){
	    		if(all_composers2) all_composers = all_composers2;
	    		if(all_composers3) all_composers = all_composers3;
	    		Object.keys(all_composers).some(function(composer){
	    			return all_composers[composer].some(function(cat){
	                    var ident = self.divider(whole,cat,true);
	                    if(ident=== 'too long'){
	                        [whole_album+' '+whole_title,whole_title].some(function(string){
	                            ident = self.divider(string,cat,true);
	                            if(!ident || ident=== 'too long'){return false}
	                            return true;
	                        })
	                    }
	    				if(ident){
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
				delete info.classical;
				info.isclassic = 'no';
				resolve(info);
	            return;
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
				delete info.classical;
				info.isclassic = 'no';
				resolve(info);
	            return;
	        }
	        if(log) console.Yolk.say(info.classical);
	        if(log) console.Yolk.say('---------------------------------------------------------------------------------------------------------------------------------');
			info.isclassic = 'yes';
			resolve(info);
	    })

		//get the original track artist if different to composer
		function putartist(comps){
			if(info.metadata.artist){
				var artist = tools.strim(info.metadata.artist);
				var artists = info.metadata.artist.replace(/[\(\)\{\}\[\]0-9]/g,'').split(/(?:[\/\,]| - | and | et | by | with | conductor )/g).map(function(artist){return artist.trim()}).filter(function(artist){
					var lastname = tools.strim(artist.split(' ').reverse()[0]);
					if(!lastname) return false;
					return !comps.some(function(c){
						return (c.indexOf(lastname) > -1)
					})
				});
			}else{
				var artists = [];
			}

			//prefer artist with work codes
			comps = comps.filter(function(c){
				if(all_composers[c].length){
					return !all_composers[c].some(function(i){
						var r = new RegExp("(^| )"+i+" [0-9]")
						if(whole.search(r) !== -1){
							info.classical.composer = c;
							return true;
						}
					})
				};
				return true;
			})
			if(!info.classical.composer){
				//check for match on whole name
				var ar = comps.filter(function(c){
					var r =  new RegExp("(^| )"+c+"( |$)")
					return whole.search(r) > -1;
				})
				//check for match on initials and name
				if(!ar.length) ar = comps.filter(function(c){
					var init = c.split(' ');
					var lastname = init.pop();
					init = init.map(function(i){return i[0]}).join(' ')+' '+lastname;
					var r =  new RegExp("(^| )"+init+"( |$)");
					return whole.search(r) > -1;
				})
				//check for match on last name
				if(!ar.length) ar = comps.filter(function(c){
					var lastname = c.split(' ').reverse()[0];
					var r =  new RegExp("(^| )"+lastname+"( |$)")
					return whole.search(r) > -1;
				})
				info.classical.composer = ar.shift();
				comps = comps.filter(function(c){
					return c!== info.classical.composer;
				})
			}else{
				comps=[];
			}
			comps = comps.concat(artists)
			if(comps.length) info.classical.artist = comps.map(function(artist){return {name:artist}});

		}

		function testname(name,composer,whole3){
			var regex = new RegExp("(?:^| )"+name+"(?: |$)");
			if(name.split(' ').length === 1 && tools.roman([name]).length) return false;
			//console.Yolk.say(name+' : '+whole3)
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
			if(all_composers) putartist(Object.keys(all_composers))
		}
	})
	kill.promises.push(p);
	return p;
}

//find classical work number references from recording title
classical.prototype.divider = function(title,op,noroman){
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

    //clean up numbers with trailing characters
    if(!noroman) title = title.replace(/[0-9][a-z]/g,function(foo){return foo.replace(/[a-z]/,'')})
    title = title.replace(/((?:^| )(no|number|num|nº|nr)[\s0-9])/g,function(match){return ' '+match.replace(/[^0-9]/g,'')});
    title = tools.despace(title);

    regex = new RegExp("(?:^| )"+op+" ",'g');
	if(title.search(regex)!==-1){
		var string = title.split(regex).filter(function(section){if(section.length){return true}});

		if(string.length > 2) string = string.filter(function(s,i){
			if(!i) return true;
			return string.some(function(s2,i2){
				if(!i2) return false;
				return (i!==i2 && s.indexOf(s2) === 0);
			})
		})

        if(string.length !== 2){return 'too long'}
		string = string[1];

        var brackets = ['{}','[]','()','“”','‘’','""'];
        brackets.forEach(function(bracket){
            var regex = new RegExp("\\"+bracket[0]+"(.*?)\\"+bracket[1],"g");
            string = string.replace(regex,'');
            string = tools.despace(string);
        })

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
		if(noroman){
			if(rem[0][0] == '0') rem[0] = rem[0].substr(1);
			if(isNaN(rem[0][0])) return false;
			return rem;
		}
        var op1 = tools.roman(rem);
        if(!op1[0]){return false}else{return op1}
	}
	return false;
}

var divider = ['act','symphony','sinfonía','symphonie','sinfonie','variation','variatio','sonata','sonate','triosonata','suite','concerto','ballade','balada','walzer','waltz','scherzo','poloneise','impromptu','mvt','op','in'];

var Classical = new classical();

module.exports = Classical;
