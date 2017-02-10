"use strict";

var search = function(){
	this.fields = ['artist','album','title'];
	this.shortstring = ['a','an','at','as','are','and','all','be','by','do','for','go','hi','i','is','in','it','me','no','or','so','to','the','us','we'];
	this.preferred_release = 'GB';
}

//wrap various elastic queries
search.prototype.wrap = {
	bool:function(types){
		var bool={};
		if(types){
			if(typeof types === 'string'){
				types = types.split(',');
				types = types.map(function(type){
					var foo = {};
					foo[type.trim().toLowerCase()]=[];
					return foo;
				})

			}
			types.forEach(function(type){
				bool[Object.keys(type)[0]]=type[Object.keys(type)[0]];
			})
		}
		return {bool:bool};
	},
	type:function(type,data){
		var foo={};
		foo[type]=data||[];
		return foo;
	},
	function_score:function(options){
		var foo = {function_score:{query:{},functions:[]}}
		if(options) Object.keys(options).forEach(function(key){
			foo.function_score[key] = options[key]
		})
		return foo
	},
	function_score_add(fs,data){
		var type = typeof data;
		if(Array.isArray(data)) type = 'array';
		if (type === 'array') data.forEach(function(push){
			fs.function_score.functions.push(push);
		})
		if(type === 'object') Object.keys(data).forEach(function(key){
			fs.function_score.query[key] = data[key]
		})
		return fs;
	},
	nested(path,query,options){
		var nested = {nested:{path:path,query:query}};
		if(options) Object.keys(options).forEach(function(key){
			nested.nested[key]=options[key]
		})
		return nested;
	},
	filter(query,options){
		var filter = {filter:query};
		if(options) Object.keys(options).forEach(function(key){
			filter[key]=options[key]
		})
		return filter;
	},
	constant_score(query,options){
		query = tools.wrap.filter(query);
		var cs = {constant_score:query};
		if(options) Object.keys(options).forEach(function(key){
			cs.constant_score[key]=options[key];
		})
		return cs;
	}
}
search.prototype.queryBuilder=function(term,data){

	//return false if term consists only of gibberish
	if(!term || !term.replace(/\s/g,'').replace(/[^a-zA-Z0-9]/g,"").length){
		return false;
	}

	//sanitise the term
	term = term.toLowerCase().
	//replace(/\&/g,'%5C%26').replace(/\#/g,'%5C%23').replace(/\:/g,'%5C%3A').
	replace(/([\!\*\+\-\=\<\>\|\(\)\[\]\{\}\^\~\?\\/"\&\#\:\%])/g,function(x){
		return "%5C"+encodeURIComponent(x)
	}).
	replace(/[^a-zA-Z0-9% ]/g,function(x){
		return encodeURIComponent(x);
	}).
	replace(/\s\s+/g,' ').trim();

	if(!data){return term};
	//process the term by supplied data;
	term=term.split(' ');
	var newterm='';
	term.forEach(function(word,index){
		if(data.fuzzy && (word.replace('%5C','').length>2&&word!=='%5C%26'&&word!=='%5C%23'&&word!=='%5C%3A')) word=word+'~';
		if(data.boost && (word.replace(/(%5C%26|%5C%23|%5C%3A|%5C)/,'').length > 1 || typeof word === 'number' || ['m','d','c','l','x','v','i'].indexOf(word) > -1)) word=word+'^'+data.boost;
		if(data.operator) {
			if(data.operator.toLowerCase() === 'and'){
				data.operator = '+'
			}
			if(data.operator.toLowerCase() === 'not'){
				data.operator = '-'
			}
			word = data.operator+word;
		}
		if(index > 0){
			newterm = newterm + ' '+word;
		}else{
			newterm = newterm+word;
		}
	})
	return newterm;
}

//construct query strings for API lookups
search.prototype.musicbrainz = function(info){
	if(info.type === 'youtube'){
		return;
	}
	var self = this;

	//strip leading track number from track title
	if(info.metadata.title && Number(info.metadata.title.split(' ')[0].replace('.',''))>=0){
		var title = info.metadata.title.split(' ');
		title.shift();
		info.metadata.title = title.join(' ');
	}

	//fix the metadata for classical music
	this.classic = false;
	var whole = '';
	['artist','album','title'].forEach(function(key){
		if(info.metadata[key]){
			info.metadata[key]=info.metadata[key].toLowerCase();

			opus.forEach(function(string){
				if(info.metadata[key].indexOf(" "+string) > -1){
					var regex = new RegExp(" "+string,"g");
					info.metadata[key]=info.metadata[key].replace(regex,' op ');
				}
				if(info.metadata[key].indexOf(string) === 0){
					var regex = new RegExp(string,"g");
					info.metadata[key]=info.metadata[key].replace(regex,'op ');
				}
			})

			if(key === 'title'){
				var title = self.strim(info.metadata[key]);
				whole = whole+title;
			}else{
				whole = whole+self.strim(info.metadata[key])+' ';
			}
		}
	})
	var whole = whole.trim();
	//console.Yolk.warn(whole)
	var postfix = false;
	var all_composers = false;
	var all_composers2 = false;
	var all_composers3 = false;
	var gotnames=[];

	function testname(name,composer,whole3){
		if(whole3.indexOf(' '+name+' ')>-1 || whole3.indexOf(name+' ')=== 0 || whole3.indexOf(' '+name)===whole3.split(' ').length-1){
			if(typeof composers[composer] === 'string'){
				composer = composers[composer];
			}
			if(!all_composers) all_composers={};
			if(!all_composers[composer]) all_composers[composer]=composers[composer];
			return true;
		}
		return false;
	}
	function getnames(whole2){
		all_composers = false;

		Object.keys(composers).forEach(function(composer){
			var lastname = composer.split(' ').reverse()[0];
			if(gotnames.indexOf(lastname)==-1){
				if(testname(composer,composer,whole2)){
					gotnames.push(lastname)
				}
			}
		})
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
		Object.keys(composers).forEach(function(composer){
			var lastname = composer.split(' ').reverse()[0];
			if(gotnames.indexOf(lastname)==-1){
				testname(lastname,composer,whole2)
			}
		})

		if(all_composers){
			var keys = Object.keys(all_composers);
			if(keys.length === 1){
				if (!info.classical) info.classical = {}
				info.classical.composer = keys[0];
				if(info.metadata.artist){
					var lastname = keys[0].split(' ').reverse()[0];
					var artist = self.strim(info.metadata.artist).trim();
					if(artist.indexOf(lastname)===-1){
						info.classical.artist = info.metadata.artist
					}
				}
			}else if(!info.retry||info.retry===1){
				if(!info.retry){
					all_composers2 = all_composers;
					info.retry = 1;
					if(info.metadata.album){
						getnames(self.strim(info.metadata.album));
					}else{
						info.retry = 2;
						getnames(self.strim(info.metadata.title));
					}
				}else{
					all_composers3 = all_composers;
					info.retry = 2;
					getnames(self.strim(info.metadata.title));
				}
			}
		}
	}
	getnames(whole);
	delete info.retry;

	if(all_composers || all_composers2 || all_composers3){
		if(all_composers2) all_composers = all_composers2;
		if(all_composers3) all_composers = all_composers3;
		Object.keys(all_composers).some(function(composer){
			return all_composers[composer].some(function(cat){
				var ident = self.divider(whole,cat,postfix,true);
				if(ident){
					if (!info.classical) info.classical = {}
					info.classical.composer = composer;
					info.classical.cat={
						id:cat,
						val:ident[0]
					};
					postfix = true;
					return true;
				}
			});
		})
	}

	divider.forEach(function(div){
		var album = self.strim(info.metadata.album);
		var title = self.strim(info.metadata.title);
		if(album && album.indexOf(div)>-1){
			var split = album.split(div);
			var string = 'album '+div+' '+split[split.length-1].trim()+' '+title
		}else{
			var string = title;
		}

		var ident = self.divider(string,div,postfix);
		if(ident){
			if(!info.classical) info.classical={};
			if(div === 'op') {
				postfix = true;
				info.classical[div] = ident;
			}else{
				if(!info.classical.types) info.classical.types = {};
				info.classical.types[div]=ident[0]
			}
		}
	})
	if(info.classical){
		var keys = Object.keys(info.classical);
		if(keys.length <= 2){
			delete info.classical;
		}
	}
	if(info.classical){
		this.classic = true;


		var cl = info.classical;
		var md = info.metadata;
		var artistname = self.queryBuilder(cl.composer);
		var artistcredit = self.queryBuilder(md.artist,{fuzzy:true})
		//var artist = '((artistname:"'+artistname+'" AND creditname:('+self.queryBuilder(md.artist,{fuzzy:true})+')^2) OR artistname:"'+artistname+'")';
		var recording = self.queryBuilder(md.title,{boost:2});
		var release = self.queryBuilder(md.album,{operator:'and'});

		var q = 'http://musicbrainz.org/ws/2/recording/?query=artistname:"'+artistname+'" AND recording:('+recording+') AND (artistname:"'+artistname+'" artistcredit:('+artistcredit+')^2 release:('+release+')^300';
		if(cl.op){
			if(cl.op[1]){
				q=q+' recording:"op '+cl.op[0]+' '+cl.op[1]+'"~1^4 recording:"op '+cl.op[0]+' '+self.toroman(cl.op[1])+'"~1^4'
			}else{
				q=q+' recording:"op '+cl.op[0]+'"~1^4 recording:"op '+cl.op[0]+'"~1^4'
			}
		}
		if(cl.types){
			Object.keys(cl.types).forEach(function(type){
				var val = cl.types[type];
				q=q+' recording:"'+type+'~ '+val+'"~1^3 recording:"'+type+'~ '+self.toroman(val)+'"~1^3';
			})
		}
		if(cl.cat && cl.cat.val) q=q+' recording:"'+cl.cat.id+' '+cl.cat.val+'"~1^20 recording:"'+cl.cat.id+' '+self.toroman(cl.cat.val)+'"~1^20';
		q=q+') status:official^20 format:(vinyl~)^20 primarytype:album^20  secondarytype:unknown^20 country:'+self.preferred_release+'^2&limit=1&fmt=json';

		info.query = q;
		//console.Yolk.warn(info.classical)
		//console.Yolk.say(info.metadata)
		//console.Yolk.say(info.query)
	}else{
		if(info.musicbrainz_id){
			info.fix = true;
		}else if(!info.metadata.artist || !info.metadata.title){
			return false;
		}
		if(info.type === 'youtube'){

		}else if(!info.musicbrainz_id){
			if(info.duration){
				var bottom = Math.floor(info.duration/1000);
				var duration='['+bottom*1000+' TO '+(bottom+1)*1000+']^50'
			}
			//info.metadata.title = info.metadata.title.replace(/\:/g,'').replace(/\,/g,'').replace('glück','gluck')
			var query = 'http://musicbrainz.org/ws/2/recording/?query=(';
			if(info.metadata.album) query = query+'release:"'+self.queryBuilder(info.metadata.album)+'"~2^50 release:('+self.queryBuilder(info.metadata.album)+')^20';
			if(duration) query=query+' dur:'+duration;
			query = query+' format:vinyl~^2 quality:high^2 (primarytype:album AND (secondarytype:unknown OR secondarytype:compilation) AND status:official)^50)'
			if(info.metadata.artist) query = query+' AND artistname:('+self.queryBuilder(info.metadata.artist,{operator:'and'})+')';

			query = query+' AND (recording:"'+self.queryBuilder(info.metadata.title)+'"^10 OR recording:"'+self.queryBuilder(info.metadata.title)+'"~2^5 OR recording:('+self.queryBuilder(info.metadata.title)+'))&fmt=json&limit=10';
			info.query = query;
		}else{
			var query = 'http://musicbrainz.org/ws/2/recording/'+info.musicbrainz_id+'?'+'&inc=artists+artist-rels+releases+release-groups+release-rels+release-group-rels+media&fmt=json';
			info.query = query
		}
	}
	return info;
	/*

	switch (type){
		case 'youtube':
			var artist = this.sanitise(info.metadata.artist);
			artist = this.uri(artist);
			var recording = this.sanitise(info.metadata.title);
			recording = this.uri(recording);
			if(info.canon_title){
				//var query = '?query=(artist:('+artist+') recording:'+recording+') AND (type:(album OR single OR ep OR other))';
				var query = '?query=artist:('+artist+') recording:'+recording;
			}else{
				//var query = '?query=(artist:('+artist+') AND recording:('+recording+')) AND (type:(album OR single OR ep OR other))';
				var query = '?query=artist:('+artist+') AND recording:('+recording+')';
			}
			return query;
		break;
		case 'internetarchive':
			var title = this.fuzzy(info.metadata.title,3);
			title = this.uri(title);
			var artist = this.fuzzy(info.metadata.artist);
			artist = this.uri(artist);
			var album = this.fuzzy(info.metadata.album,2);
			album = this.uri(album);
			var query = '?query=(artist:"'+(artist || "")+'" AND recording:('+(title || "");
			if(album){
				query = query + ') release:('+album
			}
			query = query + ')) OR (artist:"'+(artist || "")+'" recording:('+(title || "");
			if(album){
				query = query + ') release:('+album
			}
			if(info.duration){
				query = query+') dur:'+info.duration+')'
			}else{
				query = query+'))'
			}

			return query;
		break;
		case 'local':
			var title = this.boost(info.metadata.title,3);
			title = this.uri(title);
			var artist = this.sanitise(info.metadata.artist);
			artist = this.uri(artist);
			var album = this.boost(info.metadata.album,2);
			album = this.uri(album);
			var query = '?query=(artist:"'+(artist || "")+'" AND recording:('+(title || "");
			if(album){
				query = query + ') release:('+album
			}
			query = query + ')) OR (artist:"'+(artist || "")+'" recording:('+(title || "");
			if(album){
				query = query + ') release:('+album
			}
			if(info.duration){
				query = query+') dur:'+info.duration+')'
			}else{
				query = query+'))'
			}

			return query;
		break;


	}
	*/
}
//strip whitespace from a term
search.prototype.compress = function(term){
	return term.replace(/ /g,'').toLowerCase();
}
//strip all special characters
search.prototype.strip = function(string){
	string = string.trim().replace(/\'/g,'').replace(/[^\w\s]/gi,' ').replace(/ +(?= )/g,'').toLowerCase();
	return string;
}
//escape all SOLR special characters from term
search.prototype.sanitise = function(term,more){
	if(term){
		term = term.
		replace(/ +(?= )/g,'').
		replace(/([\!\*\+\-\=\<\>\|\(\)\[\]\{\}\^\~\?\:\\/"])/g, "\\$1").
		trim().toLowerCase();
		if(term && !this.gibberish(term)){
			if(more){
				term = this.sanitiseMore(term);
			}
			return term;
		}else{
			return false;
		}
	}else{
		return false;
	}
}
//internetarchive has defacto problems with certain characters. Remove them.
search.prototype.sanitiseMore = function(term){
	term=term.replace(/\\&|\\:|\\"/g,'').replace(/ +(?= )/g,'');
	//console.log(term);
	return term;
}

search.prototype.uri = function(term){
	var newterm = '';
	var ignore=['\\','!','*','+','-','=','<','>','|','(',')','[',']','{','}','^','~','?',':','/',' '];
	for(var i=0; i < term.length; i++){
		if(ignore.indexOf(term[i]) === -1){
			try{
				newterm = newterm+encodeURI(term[i]);
			}
			catch(err){
				console.Yolk.warn(err);
			}

		}else{
			newterm = newterm+term[i];
		}
	}
	return newterm.replace(/\&/g,'%26').replace(/\#/g,'%23');
}

//split term around defined search operators and return the string not assigned
search.prototype.clean = function(term,dirty){
	this.fields.filter(function(field){
		term = term.split(field+':')[0];
	});
	if(!dirty){
		term = this.sanitise(term);
	}
	return term;
};
//split search term into identifiers and return Object
search.prototype.terms = function(term){
	var self = this;
	var terms = {};
	this.fields.forEach(function(field){
		if(term.split(field+':')[1]){
			terms[field] = self.clean(term.split(field+':')[1]);
		};
	});
	terms.prefix = this.clean(term,true).trim();
	return terms;
}

//format term to fuzzy ~ operator
search.prototype.fuzzy = function(term,boost,more){
	var self = this;
	if(boost){
		boost = '^'+boost;
	}else{
		boost = '';
	}
	var fuzzy = [];
	if(term = this.sanitise(term)){
		if(more){
			term = this.sanitiseMore(term);
		}
		fuzzy = term.split(' ');
		var newfuzz='';
		fuzzy.forEach(function(fuzz){
			if(self.shortstring.indexOf(fuzz) === -1 && (fuzz.length > 2 || (self.classic && Number(fuzz) > 0))){
				if(self.classic && Number(fuzz) > 0){
					newfuzz = newfuzz+fuzz+boost+' ';
				}else{
					newfuzz = newfuzz+fuzz+'~'+boost+' ';
				}

			}else{
				newfuzz = newfuzz+fuzz+' ';
			}
		});
		newfuzz = newfuzz.trim();
		return newfuzz;
	}else{
		return '';
	}

}

//format term to fuzzy ~ operator with AND junction
search.prototype.fuzzyAnd = function(term,boost,more){
	var self = this;
	if(boost){
		boost = '^'+boost;
	}else{
		boost = '';
	}
	var fuzzy = [];
	if(term = this.sanitise(term)){
		if(more){
			term = this.sanitiseMore(term);
		}
		fuzzy = term.split(' ');
		var newfuzz='';
		fuzzy.forEach(function(fuzz){
			if(self.shortstring.indexOf(fuzz) === -1 && (fuzz.length > 2 || (self.classic && Number(fuzz) > 0))){
				if(self.classic && Number(fuzz) > 0){
					newfuzz = newfuzz+fuzz+boost+' AND ';
				}else{
					newfuzz = newfuzz+fuzz+'~'+boost+' AND ';
				}

			}else{
				newfuzz = newfuzz+fuzz+' AND ';
			}
		});
		newfuzz = newfuzz.split(' AND ');
		newfuzz.pop();
		newfuzz = newfuzz.join(' AND ');
		return newfuzz;
	}else{
		return '';
	}
}

//boost a search term
search.prototype.boost = function(term,boost,more){
	var self = this;
	if(boost){
		boost = '^'+boost;
	}else{
		boost = '';
	}
	var boosted = [];
	if(term = this.sanitise(term)){
		if(more){
			term = this.sanitiseMore(term);
		}
		boosted = term.split(' ');
		var newboos='';
		boosted.forEach(function(boos){
			if(self.shortstring.indexOf(boos) === -1 && (boos.length > 2 || (self.classic && Number(boos) > 0))){
				newboos = newboos+boos+boost+' ';
			}else{
				newboos = newboos+boos+' ';
			}
		});
		newboos = newboos.trim();
		return newboos;
	}else{
		return '';
	}
}

//check if string consists only of special characters
search.prototype.gibberish = function(term){
	if(!term){
		return true;
	}
	term = this.compress(term);
	term = term.replace(/[^a-zA-Z0-9]/g,"");
	if(term.length){
		return false;
	}else{
		return true;
	}
}

//convert track time formats to milliseconds
search.prototype.duration = function(len){
	len = len.toString();
	if(len.indexOf(':') > -1){
		len = len.split(':');
		len = (len[0]*60+len[1])*10;
	}else{
		len = len*1000;
	}
	return len;
}
//find bracketed postfix to string
search.prototype.postfix = function(string){
	string = string.trim();
	var brackets = string.match(/(\([^)]+\)|\[[^\]]+\]|\{[^}]+\})/g);

	if(brackets){
		var rem = string.split(brackets[brackets.length-1]).filter(function(item){if(item!==''){return true;}})
		if(rem.length===1){
			return {prefix:rem[0].trim(),postfix:brackets[brackets.length-1]}
		}
	}
	return false;
}
//convert a number to roman numeral
search.prototype.toroman = function(num) {
  var lookup = {M:1000,CM:900,D:500,CD:400,C:100,XC:90,L:50,XL:40,X:10,IX:9,V:5,IV:4,I:1},roman = '',i;
  for ( i in lookup ) {
    while ( num >= lookup[i] ) {
      roman += i;
      num -= lookup[i];
    }
  }
  return roman;
}
//Take an array of strings and return an array of numbers for numbers and roman numbers
search.prototype.roman = function (strings) {
	strings = strings.filter(function(string){
		if(string !==''){
			return string;
		}
	})
	function romanValue(s) {
		s.replace(/#/g,'');
		if(Number(s) > 0){
			return Number(s)
		}
		if (s === 'nope'|| s === ' '){
			return 'nope';
		}
		s = s.toUpperCase();
		return s.length ? function () {
			var parse = [].concat.apply([], glyphs.map(function (g) {
				return 0 === s.indexOf(g) ? [trans[g], s.substr(g.length)] : [];
			}));
			if(!parse[1] && !parse[0]){
				return 'nope';
			}
			return parse[0] + romanValue(parse[1]);
		}() : 0;
	}
	var trans = {M: 1E3,CM: 900,D: 500,CD: 400,C: 100,XC: 90,L: 50,XL: 40,X: 10,IX: 9,V: 5,IV: 4,I: 1}
	var glyphs = Object.keys(trans);
	var numbers = strings.map(romanValue)
	return numbers.filter(function(item){
		if (typeof item === 'number'){
			return true;
		}
	});
}

//find classical work number references from recording title
search.prototype.divider = function(title,op,postfix,composer){
	if(!title){return false};
	var self = this;
	if(title.indexOf(' '+op)>-1){
		var split = title.split(' '+op);
		split.forEach(function(section){
			if(Number(section[0])>0){
				var regex = new RegExp(op+section[0],'g');
				title = title.replace(regex,op+' '+section[0])
			}
		})
	}
	if(title.indexOf(' '+op+' ')>-1 || title.indexOf(op+' ')===0){
		var string;
		string = title.split(' '+op+' ')[1];
		if(!string){
			string = title.replace(op+' ','');
		}
		if(op === 'op' || composer){
			if(composer){
				var op1 = self.roman([title.split(' '+op+' ')[1].split(' ')[0]]);
				if(!op1[0]){return false}
			}else{
				var op1 = self.roman(string.split(' '));
			}
			if(!op1[1] && !postfix && !composer){
				var prefix = title.split(' '+op+' ')[0].split(' ');
				if(!prefix.some(function(item){
					if(item.indexOf('#') === 0){
						item = item.replace('#','');
						if(Number(item)>0){
							op1.push(Number(item));
						}
					}
				})){
					var prefix = self.roman(prefix);
					if(prefix[0]){
						op1.push(prefix[0])
					}
				}

			}
			return op1;
		}else{
			var parts = string.split(' ')

			if(Number(parts[0])>0 || parts[0]==='no' || parts[0]==='nr'|| parts[0][0]==='#' || parts[0]==='nº'){
				if(Number(parts[0])>0){
					var op1=[Number(string.split(' ')[0])]
				}else if(parts[0][0]==='#' && Number(parts[0].slice(1))>0){
					var op1=[Number(parts[0].slice(1))]
				}else if((parts[0]==='no'||parts[0]==='nr' || parts[0]==='nº') && parts[1] && Number(parts[1])>0){
					var op1=[Number(parts[1])]
				}else{
					return false;
				}
				return op1;
			}else{
				return false;
			}
		}
	}
	return false;
}
//lowercase and trim a string
search.prototype.lower = function(phrase){
	return phrase.trim().toLowerCase();
}
//strip a term of punctuation for comparative purposes
search.prototype.strim = function(phrase){
	if(!phrase){return false};
	phrase = phrase.trim().toLowerCase().replace(/(\'|\?|\.|\,|\(|\)|\:|\[|\]|\{|\}|\-|\/|\_|\’|\`|\;)/g,' ').replace(/\&/g,'and');
	phrase = phrase.split(' ');
	phrase = phrase.filter(function(sec){
		sec = sec.trim();
		return sec.length;
	})
	phrase = phrase.map(function(sec){
		return sec.trim()
	})
	phrase = phrase.join(' ');
	return phrase;
}

//fix a string by normalising quote marks
search.prototype.fix = function(string){
	if(!string){return false};
	return string.replace(/\’/g,"'").replace(/\s\s+/g, ' ').trim().toLowerCase();
}

var opus = ['op.','op:','op-','op_'];
var divider = ['act','symphony','sinfonía','symphonie','sinfonie','variation','variatio','sonata','sonate','triosonata','suite','concerto','ballade','balada','walzer','waltz','scherzo','poloneise','impromptu','op']
var composers = {
	"carl friedrich abel":["k"],
	"johann georg albrechtsberger":["s","som"],
	"isaac albéniz":"isaac albéniz",
	"isaac albeniz":["b"],
	"hugo alfvén":["r"],
	"hugo alfven":"hugo alfvén",
	"daniel auber":["awv"],
	"carl philipp emanuel bach":["wq"],
	"johann christian bach":["terry; w","terry;w","terryw"],
	"johann christoph friedrich bach":["hw","l"],
	"johann sebastian bach":["bwv"],
	"wilhelm friedemann bach":["f"],
	"bálint bakfark":["vb"],
	"balint bakfark":"bálint bakfark",
	"samuel barber":["h"],
	"béla bartók":["bb","dd","sz"],
	"bela bartok":"béla bartók",
	"arnold bax":["gp"],
	"ludwig van beethoven":["hess","woo","bia"],
	"franz benda":["l"],
	"hector berlioz":["h"],
	"georges bizet":["wd"],
	"arthur bliss":["b","f"],
	"luigi boccherini":["g"],
	"joseph bodin de boismortier":["pb"],
	"johannes brahms":["woo"],
	"frank bridge":["h"],
	"anton bruckner":["wab"],
	"ferruccio busoni":["bv"],
	"dieterich buxtehude":["buxwv"],
	"antonio de cabezón":["j"],
	"antonio de cabezon":"antonio de cabezón",
	"marc-antoine charpentier":["h"],
	"frédéric chopin":["a","b","kk"],
	"frederic chopin":"frédéric chopin",
	"muzio clementi":["t"],
	"louis-nicolas clérambault":["c"],
	"louis-nicolas clerambault":"louis-nicolas clérambault",
	"peter cornelius":["w"],
	"françois couperin":["b"],
	"francois couperin":"françois couperin",
	"franz danzi":["p"],
	"claude debussy":["l"],
	"michel richard delalande":["s"],
	"carl ditters von dittersdorf":["g","k","kr","l","y"],
	"gaetano donizetti":["in"],
	"john dowland":["p"],
	"jan ladislav dussek":["c"],
	"antonín dvořák":["h","b","s","t"],
	"antonin dvorak":"antonín dvořák",
	"giles farnaby":["m"],
	"johann friedrich fasch":["fwv"],
	"alfonso ferrabosco":["rc"],
	"frederic ernest fesca":["fref"],
	"zdeněk zdenek fibich":["h"],
	"zdenek zdenek fibich":"zdeněk zdenek fibich",
	"john field":["h"],
	"césar franck":["fwv"],
	"cesar franck":"césar franck",
	"frederick the great":["s"],
	"giovanni gabrieli":["c"],
	"florian leopold gassmann":["h"],
	"orlando gibbons":["h"],
	"christoph willibald gluck":["w"],
	"françois-joseph gossec":["b"],
	"francois-joseph gossec":"françois-joseph gossec",
	"louis moreau gottschalk":["d","ro"],
	"charles gounod":["cg"],
	"enrique granados":["dlr"],
	"carl heinrich graun":["graunwv","m","w"],
	"johann gottlieb graun":["graunwv","w"],
	"christoph graupner":["gwv"],
	"edvard grieg":["eg"],
	"charles tomlinson griffes":["a"],
	"adalbert gyrowetz":["r"],
	"george frideric handel":["b","hwv","hg","hha"],
	"joseph haydn":["hob"],
	"michael haydn":["mh","p"],
	"johann david heinichen":["h"],
	"e t a hoffmann":["av"],
	"gustav holst":["h"],
	"arthur honegger":["h"],
	"johann nepomuk hummel":["s"],
	"engelbert humperdinck":["ehwv"],
	"leoš janáček":["jw"],
	"leos janacek":"leoš janáček",
	"leopold kozeluch":["p"],
	"joseph martin kraus":["b"],
	"conradin kreutzer":["kwv"],
	"franz liszt":["l","lw","r","s"],
	"albert lortzing":["lowv"],
	"jean-baptiste lully":["lwv"],
	"alessandro marcello":["s"],
	"benedetto marcello":["s"],
	"bohuslav martinů":["h","saf"],
	"bohuslav martinu":"bohuslav martinů",
	"erkki melartin":["em"],
	"fanny mendelssohn":["h"],
	"felix mendelssohn":["mwv"],
	"ernest john moeran":["r"],
	"johann melchior molter":["mwv"],
	"georg matthias monn":["f"],
	"johann christoph monn":["f"],
	"claudio monteverdi":["sv"],
	"leopold mozart":["e","s"],
	"wolfgang amadeus mozart":["k","kv","wsf"],
	"josef mysliveček":["ed"],
	"josef myslivecek":"josef mysliveček",
	"carl nielsen":["cnw","fs"],
	"jacques offenbach":["al"],
	"okelly family":["okc"],
	"johann pachelbel":["p"],
	"niccolò paganini":["ms"],
	"niccolo paganini":"niccolò paganini",
	"giovanni paisiello":["p","r"],
	"selim palmgren":["sp"],
	"ignaz pleyel":["b"],
	"francis poulenc":["fp"],
	"giacomo puccini":["sc"],
	"gaetano pugnani":["z"],
	"henry purcell":["z"],
	"johann joachim quantz":["b","qv"],
	"sergei rachmaninoff":["tn"],
	"maurice ravel":["mr"],
	"ottorino respighi":["p"],
	"josef rheinberger":["rwv"],
	"alessandro rolla":["bi"],
	"johan helmich roman":["beri","hrv"],
	"antonio rosetti":["kaul","m"],
	"albert roussel":["l"],
	"giovanni battista sammartini":["jc"],
	"domenico scarlatti":["kk","l","p"],
	"samuel scheidt":["sswv"],
	"franz schubert":["d"],
	"robert schumann":["woo"],
	"heinrich schütz":["swv"],
	"heinrich schutz":"heinrich schütz",
	"carlos de seixas":["k"],
	"antonio soler":["m","r"],
	"kaikhosru sorabji":["kss"],
	"anton stamitz":["s"],
	"johann stamitz":["w"],
	"alessandro stradella":["g"],
	"richard strauss":["av","trv"],
	"igor stravinsky":["k"],
	"jan pieterszoon sweelinck":["l"],
	"franz xaver süssmayr":["smwv"],
	"franz xaver sussmayr":"franz xaver süssmayr",
	"giuseppe tartini":["b","d"],
	"pyotr ilyich tchaikovsky":["cw","čw","th"],
	"georg philipp telemann":["twv"],
	"giuseppe torelli":["g"],
	"eduard tubin":["etw"],
	"heitor villa-lobos":["a"],
	"giovanni battista viotti":["w","g"],
	"antonio vivaldi":["f","m","p","rn","rv"],
	"antonín vranický":["rv"],
	"antonin vranicky":"antonín vranický",
	"georg christoph wagenseil":["wv"],
	"richard wagner":["wwv"],
	"johann baptist wanhal":["b","w"],
	"carl maria von weber":["j"],
	"anton webern":["m"],
	"sylvius leopold weiss":["k","sc"],
	"jan dismas zelenka":["zwv"]
}
var tools = new search()
module.exports = tools;
