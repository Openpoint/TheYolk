'use strict'

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

var path = require('path');
const db = require('./elasticsearch.js');

var utils = function(){};

//create the database indexes
utils.prototype.boot = function(index){

	if(typeof index === 'object'){
		var settings = index.settings;
		var ids = index.types
		index = index.index;
	}

	this.index_root = index;
	var self = this;

	return new Promise(function(resolve,reject){
		db.exists(index).then(function(exists){
			if(!exists){
				var hash = {
					index:index,
					body:{}
				}
				if(ids && ids.length){
					var mappings = {}
					ids.forEach(function(id){
						mappings[id.type]=id.mapping;

					})
					hash.body.mappings = mappings;
				}
				if(settings){
					hash.body.settings = settings;
				}
				db.create(hash).then(function(data){
					resolve(true);
				},function(err){
					console.error(err);
				});
			}else{
				resolve('Already Exists');
			}
		});
	})
}

//gets settings from file or database and returns setting data
utils.prototype.settings = function(type){
	var self = this;
	return new Promise(function(resolve,reject){
		db.get(self.index_root+'.settings.'+type).then(function(data){
			if(data){
				resolve(data);
			}else{
				var settings = Yolk.modules[type].config.settings;

				db.client.create({index: self.index_root,type: 'settings',id:type,body:settings},function(err,data){
					if(err) console.error(err);
					db.get(self.index_root+'.settings.'+type).then(function(data){
						resolve(data);
					})

				})
			}
		},function(err){
			console.error(err);
		})
	})
}

//convert date stamp to format
utils.prototype.date = function(date){
	if(!date) return "";
	date = new Date(date);
	return '('+date.getFullYear(date)+')';
}
//get the difference between two dates
utils.prototype.dateDiff = function (now,b,period) {
	if(now){
		var a = new Date(now);
	}else{
		var a =new Date();
	}
	b = new Date(b);

	var days = 1000 * 60 * 60 * 24;
	var hours = 1000 * 60 * 60;
	var minutes = 1000 * 60;
	var seconds = 1000;
	switch(period){
		case 'days':
			var span = days;
		break;
		case 'hours':
			var span = hours;
		break;
		case 'minutes':
			var span = minutes;
		break;
		case 'seconds':
			var span = seconds;
		break;
		case 'ago':
			var span = 1;
		break;
		default:
			var span = days;
	}
	var utc1 = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate(), a.getHours(), a.getMinutes());
	var utc2 = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate(), b.getHours(), b.getMinutes());
	var diff = Math.floor((utc2 - utc1) / span*-1);
	if(period !== 'ago'){
		return diff;
	}else{
		//return Math.floor(diff/seconds)
		var time = {};
		var val = '';
		if(Math.floor(diff/days) > 0){
			time.days = Math.floor(diff/days);
			diff = diff - (time.days*days);
			if(time.days === 1){
				val = val+time.days+' day ';
			}else{
				val = val+time.days+' days ';
			}

		}
		if(Math.floor(diff/hours) > 0){
			time.hours = Math.floor(diff/hours);
			diff = diff - (time.hours*hours);
			if(time.hours === 1){
				val = val+time.hours+' hour ';
			}else{
				val = val+time.hours+' hours ';
			}

		}
		if(Math.floor(diff/minutes) > 0){
			time.minutes = Math.floor(diff/minutes);
			diff = diff - (time.minutes*minutes);
			if(time.minutes === 1){
				val = val+time.minutes+' minute ';
			}else{
				val = val+time.minutes+' minutes ';
			}
		}
		if(val.length){
			val = val+' ago';
		}else{
			val = 'Just Now'
		}
		return val;
	}


}
module.exports = utils;
