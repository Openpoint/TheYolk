'use strict'
var path = require('path');

angular.module('yolk').factory('utils',['$q', function($q) {

	var utils = function(module){
		this.db = Yolk.db;
		this.module = module;
		this.index_root;
	};

	//create the database indexes
	utils.prototype.boot = function(index){

		if(typeof index === 'object'){
			var settings = index.settings;
			var ids = index.types
			index = index.index;
		}

		this.index_root = index;
		var self = this;

		return new $q(function(resolve,reject){
			self.db.exists(index).then(function(exists){
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
					self.db.create(hash).then(function(data){
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

		return new $q(function(resolve,reject){
			self.db.get(self.index_root+'.settings.'+type).then(function(data){
				if(data){
					resolve(data);
				}else{
					var settings = Yolk.modules[type].config.settings;
					if(Object.keys(settings).length){
						var body = [];
						var count = 0;
						body.push({
							create:{
								_index: self.index_root,
								_type: 'settings',
								_id:type
							}
						})
						for(var key in settings){
							var doc = {};
							doc[key]=settings[key];
							if(count > 0){
								body.push({
									update:{
										_index: self.index_root,
										_type: 'settings',
										_id:type
									}
								})
								body.push({doc:doc});
							}else{
								body.push(doc);
							}
							count++;
						}
						self.db.client.bulk({body:body},function(err,data){
							if(err){
								console.error(err);
								//todo: error handling
							}else{
								resolve(false);
							}

						});
					}else{
						resolve(false);
					}
				}
			},function(err){
				console.error(err);
			})
		})
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
	return utils;
}])
