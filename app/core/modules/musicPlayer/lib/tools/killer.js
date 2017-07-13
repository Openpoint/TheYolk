"use strict";

var killer = function(){
	this.kill = false;
	this.promises = [];
	this.requests = [];
}
killer.prototype.Kill=function(){
	this.kill = true;
	this.promises.forEach(function(p){p.cancel()});
	this.requests.forEach(function(r){r.abort()});
	this.promises=[];
	this.requests=[];
}
killer.prototype.update = function(type){
	this[type] = this[type].filter(function(foo){
		if(type === 'promises') return !foo._bitField;
		if(type === 'requests') return !foo.status;
	})
}
module.exports = new killer()
