"use strict";

var search = function(){
	this.fields = ['artist','album','title'];
	this.shortstring = ['a','an','at','as','are','and','all','be','by','do','for','go','hi','i','is','in','it','me','no','or','so','to','the','us','we'];
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
//internetarchive has defacto problems with certain characters. Remove them.
search.prototype.sanitiseMore = function(term){
	term=term.replace(/\\&|\\:|\\"/g,'').replace(/ +(?= )/g,'');
	//console.log(term);
	return term;
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
	if(len.indexOf(':') > -1){
		len = len.split(':');
		len = (len[0]*60+len[1])*10;
	}else{
		len = len*1000;
	}
	return len;
}
//construct query strings for API lookups
var classical = [' op.',' op:',' op-',' op_'];
search.prototype.musicbrainz = function(type,info){


	//fix the metadata for classical music
	this.classic = false;
	Object.keys(info.metadata).forEach(function(key){
		if(info.metadata[key]){
			info.metadata[key]=info.metadata[key].toLowerCase();

			classical.forEach(function(string){
				if(info.metadata[key].indexOf(string) > -1){
					var regex = new RegExp(string,"g");
					info.metadata[key]=info.metadata[key].replace(regex,' op ');
				}
			})
		}
	})
	if(info.metadata.album && info.metadata.album.indexOf(' op ')>-1){
		info.metadata.title = info.metadata.album+' '+info.metadata.title;
	}
	if(info.metadata.album && info.metadata.album.indexOf(' op ')>-1 || info.metadata.title.indexOf(' op ')>-1){
		this.classic = true;
	}
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
		break

	}
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
//compare two recording titles to determine if they represent a classical recording
search.prototype.classical = function(title1,title2,op1,composers){
	var op = divider[op1.index]
	//check for classical music
	if((title1.indexOf(' '+op+' ')>-1 || title1.indexOf(op+' ')===0) && (title2.indexOf(' '+op+' ')>-1 || title2.indexOf(op+' ')===0)){

		var op2 = this.divider(title2,op1.index);

		if(op1.val[0] !== op2.val[0] || op1.val[1] !== op2.val[1]){
			return false;
		}

		return true;

	}else if(title1.indexOf(' bwv ')>-1 && title2.indexOf(' bwv ')>-1){
		var bwv2 = title2.split(' bwv ')[1].split(' ')[0];
		if(Number(bwv2)>0){
			composers.bwv[1] = Number(bwv2)
		}
		if(!composers.bwv[0]||!composers.bwv[1]||composers.bwv[0]!==composers.bwv[1]){
			return false;
		}
		return true;
	}else{
		return false;
	}
}

//find classical work number references from recording title
var divider = ['op','variatio','sonata']
search.prototype.divider = function(title,index){
	var self = this;
	var op1 = false;
	if(index){
		divider=[divider[index]];
	}
	divider.some(function(op,index){
		if(title.indexOf(' '+op+' ')>-1 || title.indexOf(op+' ')===0){
			if(!title){
				return false;
			}
			op1 = {
				index:index,
				val:self.roman(title.split(' '+op+' ')[1].split(' '))
			}
			if(!op1){
				op1 = {
					index:index,
					val:op1 = self.roman(title.replace(op+' ','').split(' '))
				}
			}
			if(!op1.val[1]){
				var prefix = title.split(' '+op+' ')[0].split(' ');
				if(!prefix.some(function(item){
					if(item.indexOf('#') === 0){
						item = item.replace('#','');
						if(Number(item)>0){
							op1.val[1] = Number(item);
						}
						return true;
					}
				})){
					var prefix = self.roman(prefix);
					if(prefix[0]){
						op1.val.push(prefix[0])
					}
				}

			}
			return true;
		}
		return false;
	})
	return op1;
}
//lowercase and trim a string
search.prototype.lower = function(phrase){
	return phrase.trim().toLowerCase();
}
//strip a term of punctuation for comparative purposes
search.prototype.strim = function(phrase){
	return phrase.trim().toLowerCase().replace(/(\'|\?|\.|\,|\(|\)|\:|\[|\]|\{|\})/g,'').replace(/\&/g,'and');
}
module.exports = new search();
