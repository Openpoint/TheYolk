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
			newterm = newterm+encodeURI(term[i]);
		}else{
			newterm = newterm+term[i];
		}
	}
	return newterm.replace(/\&/g,'%26');
}
//internetarchive has defacto problems with certain characters. Remove them.
search.prototype.sanitiseMore = function(term){
	term=term.replace(/\\&|\\:|\\"/g,'').replace(/ +(?= )/g,'');
	//console.log(term);
	return term;
}
//split term around defined search operators and return the string not assigned
search.prototype.clean = function(term){
	this.fields.filter(function(field){
		term = term.split(field+':')[0];
	});
	term = this.sanitise(term);
	return term;
};

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
			if(self.shortstring.indexOf(fuzz) === -1 && fuzz.length > 2){
				newfuzz = newfuzz+fuzz+'~'+boost+' ';
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
			if(self.shortstring.indexOf(fuzz) === -1 && fuzz.length > 2){
				newfuzz = newfuzz+fuzz+'~'+boost+' AND ';
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
			if(self.shortstring.indexOf(boos) === -1 && boos.length > 2){
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
module.exports = new search();
