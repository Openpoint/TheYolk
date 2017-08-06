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

var killer = function(){
	var self = this;
	this.kill = false;
	this.promises = [];
	this.requests = [];
	if(process.Yolk) process.Yolk.win.on('close', () => {
		self.Kill();
	})
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
