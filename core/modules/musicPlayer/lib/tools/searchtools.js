"use strict";

var search = function(){
	this.fields = ['artist','album','title'];
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
	})
	term = this.despace(term)

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

//split term around defined search operators and return the string not assigned
search.prototype.clean = function(term,dirty){
	this.fields.filter(function(field){
		term = term.split(field+':')[0];
	});
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


//convert time formats to milliseconds
search.prototype.duration = function(len){
	len = len.toString();
	if(len.indexOf(':') > -1){
		len = len.split(':');
		len = (len[0]*60+len[1])*1000;
	}else{
		len = len*1000;
	}
	return len;
}
//find bracketed postfix to string
search.prototype.postfix = function(string){
	if(!string){return false};
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

//strip whitespace from a term
search.prototype.compress = function(term){
	return term.replace(/ /g,'').toLowerCase();
}

//strip all special characters from string
search.prototype.strip = function(string){
	string = string.trim().replace(/\'/g,'').replace(/[^\w\s]/gi,' ').replace(/ +(?= )/g,'').toLowerCase();
	return string;
}

//trim and remove double spaces
search.prototype.despace = function(string){
	return string.replace(/\s\s+/g,' ').trim();
}

//lowercase and trim a string
search.prototype.lower = function(phrase){
	return phrase.trim().toLowerCase();
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
//strip a term of punctuation for comparative purposes
search.prototype.strim = function(phrase){
	if(!phrase){return false};
	phrase = phrase.trim().toLowerCase().replace(/[\¬\`\¦\!\"\£\$\%\^\*\_\-\+\=\~\#\@\'\:\;\,\.\?\/\\\|\’\“\”\[\]\{\}\(\)]/g,' ').replace(/\&/g,' and ');
	phrase = this.despace(phrase);
	return phrase;
}

//fix a string by normalising quote marks
search.prototype.fix = function(string){
	if(!string){return false};
	return string.replace(/\’/g,"'").replace(/\s\s+/g, ' ').replace(/‐/g,'-').trim().toLowerCase();
}


var tools = new search()
module.exports = tools;
