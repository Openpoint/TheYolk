'use strict';

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

angular.module('yolk').factory('internetarchive',['$http','$q',function($http,$q) {

	const {ipcRenderer} = require('electron');
	const path = require('path');
	const crypto = require('crypto');
	const cpu = require('../../lib/tools/cpu.js');
	const kill = require('../../lib/tools/killer.js');
	const tools = require('../../lib/tools/searchtools.js');
	const log = false;

	var $scope;

	var q;
	var resetq = function(){
		q = {
			queries:[],
			meta:[],
			sources:[]
		};
	}
	resetq();
	var ia = function(scope){
		var self = this;
		$scope = scope;
		this.progress = 0;
		this.searches = [];
		this.max_duration = 30*60*1000 //maximum track length in milliseconds
		this.getSearches()
	}
	ia.prototype.resume=function(scope){
		$scope = scope;
		return this;
	}
	ia.prototype.getSearches = function(){
		var self = this;
		this.queries=[];
		$scope.db.client.get({index:$scope.db_index,type:"internetarchivesearch",id:"queries"},function(err,data){
			if(!err){
				self.queries = data._source.queries;
			}
		})
	}
	ia.prototype.saveSearches = function(query){
		var self = this;
		$scope.db.client.update({index:$scope.db_index,type:"internetarchivesearch",id:"queries",refresh:true,body:{doc:{queries:self.queries},doc_as_upsert:true}},function(err,data){
			if(kill.kill)return;
			if(err) console.error(err);
			self.musicbrainz(query);
		})
	}
	//submit a search to the internetarchive server	and get a list of identifiers
	ia.prototype.search = function(term){
		kill.kill=false;
		var self = this;
		var queries = self.searchString(term);
		if(!this.progress) this.progress = 'load';
		this.musicbrainz(queries.qdb);
		var query = 'https://archive.org/advancedsearch.php?q='+queries.qia;
		var r = $.get({url:query}).done(function(response){
			var result = response.response.docs;
			if(result.length){
				q.meta.push({
					query:queries.qdb,
					blocks:result
				});
				if(self.progress === 'load') self.progress = 0;
				self.progress+=result.length;
				self.getMeta(queries.qdb);
			}
		}).fail(function(err){
			//if(!this.progress==='load') this.progress = 0;
			self.progress = err.statusText;
			console.error(err);
		}).always(function(){
			kill.update('requests')
		});
		kill.requests.push(r);
	}
	//process the query to a database search string
	ia.prototype.searchString = function(term){
		var hash = tools.terms(term);
		var qdb = tools.extquery(term,'ia');
		qdb = {index:$scope.db_index,type:"internetarchivesearch",body:{query:qdb}};
		var iaterm = hash.prefix||'';
		if(hash.artist) iaterm += ' '+hash.artist
		if(hash.album) iaterm += ' '+hash.album
		if(hash.title) iaterm += ' '+hash.title
		iaterm = iaterm.trim();

		var qia = []
		Object.keys(hash).forEach(function(key){
			var boost = 2;
			if(key === 'artist') boost = 10;
			if(key === 'album') boost = 3;
			if(key === 'title') boost = 5;
			qia.push('title:('+tools.queryBuilder(hash[key],{boost:boost})+') OR title:"'+tools.queryBuilder(hash[key],{fuzzy:true})+'" OR subject:('+tools.queryBuilder(hash[key],{boost:boost})+') OR subject:"'+tools.queryBuilder(hash[key],{fuzzy:true})+'" OR description:('+tools.queryBuilder(hash[key],{boost:boost})+') OR description:"'+tools.queryBuilder(hash[key],{fuzzy:true})+'"')
		})
		qia = '('+qia.join(' OR ')+')';

		var excludes = {
			podcast:'-podcast -podcasts',
			cover:'-cover -covers',
			tribute:'-tribute -tributes',
			bootleg:'-bootleg -bootlegs',
			live:'-live',
			set:'-set',
			radio:'-radio',
			mix:'-mix -remix'
		}
		var compare = tools.strim(iaterm);
		var exclude = [];
		Object.keys(excludes).forEach(function(key){
			if(compare.indexOf(key)===-1){
				exclude.push(excludes[key])
			}
		})
		exclude = exclude.join(' ');
		//qia = qia+' AND title:('+exclude+') AND description:('+exclude+') AND subject:('+exclude+') AND mediatype:audio &fl[]=downloads&fl[]=title,subject,collection,identifier,description,creator AND collection:opensource_audio&sort[]=downloads desc&rows=1000&page=1&output=json';
		qia = qia+' AND title:('+exclude+') AND description:('+exclude+') AND subject:('+exclude+') AND mediatype:audio &fl[]=downloads&fl[]=title,subject,collection,identifier,description,creator AND collection:opensource_audio&rows=500&page=1&output=json';

		var searchstrings = {qia:qia,qdb:qdb}
		return searchstrings;
	};

	//get the full details of the specific found identifier, including track file listing
	ia.prototype.proceed = function(query){
		var self = this;
		self.progress--;
		if(!self.progress){
			self.saveSearches(query);
		}
	}
	ia.prototype.getMeta = function(query){
		var self = this;
		if (q.meta.length){
			var query = q.meta[0].query;
			var src = q.meta[0].blocks.shift();
			var downloads = (src.downloads||0)*1
			src = src.identifier;
			if(!q.meta[0].blocks.length){
				q.meta.shift();
			}
			if(this.queries.indexOf(src) !== -1){
				self.progress--;
				if(!self.progress) self.saveSearches(query);
				self.getMeta(query);
				return;
			}else{
				this.queries.push(src);
			}
			var url = 'https://archive.org/metadata/'+src;
			var r = $.get({url: url}).done(function(response){
				if(response.files) var files = self.getFiles(response.files);
				if(files && files.length){
					var bulk=[];
					var count = files.length;
					var error = 0;
					files.forEach(function(file){
						var newfile = {
							metadata:{}
						};
						newfile.name = encodeURIComponent(file.name);
						newfile.dir = encodeURIComponent(response.metadata.identifier);
						newfile.url = 'https://archive.org/download/'+path.join(newfile.dir,newfile.name);
						newfile.metadata.title = file.title;
						newfile.metadata.artist = file.artist;
						newfile.metadata.album = file.album;
						newfile.musicbrainz_id = file.musicbrainz_id;
						newfile.musicbrainzed ='no';
						if(file.length) newfile.duration = tools.duration(file.length)
						newfile.id = crypto.createHash('sha1').update(newfile.url).digest('hex');
						newfile.internetarchive = src;
						newfile.downloads = downloads;

						count--;
						//if(data) newfile = data;
						bulk.push({create:{_index:$scope.db_index,_type:'internetarchivesearch',_id:newfile.id}});
						bulk.push(newfile);
						//put the found files to database
						if(bulk.length && !count){
							$scope.db.client.bulk({body:bulk,refresh:true},function(err,response){
								if(kill.kill) return;
								self.proceed(query);
								if(err){
									console.error(err);
								}
							});
						}else if(!count){
							self.proceed(query);
						}
					});
				}else{
					self.progress--;
					if(!self.progress) self.saveSearches(query);
				}
			}).fail(function(err){
				if(kill.kill) return;
				self.progress--;
				if(!self.progress) self.saveSearches(query);
			}).always(function(){
				kill.update('requests')
			});
			kill.requests.push(r);
			self.getMeta(query);
		}else{
			if(log) console.log('Finished Meta');
		}
	}
	//check if file has musicbrainz id
	ia.prototype.gotId = function(file){
		if(file['external-identifier'] && file['external-identifier'].length > 1){
			var ids={};
			if(Array.isArray(file['external-identifier'])){
				file['external-identifier'].forEach(function(tid){
					var id = tid.split(':');

					if(id[id.length-1] !== 'unknown'){
						ids[id[1]]=id[2];
					}
				});
			}else{
				var id = file['external-identifier'].split(':');
				if(id[id.length-1] !== 'unknown'){
					ids[id[1]]=id[2];
				}
			}
			if(ids.mb_recording_id){
				file.musicbrainz_id = ids.mb_recording_id;
				return file;
			}else{
				return file;
			}
		}else{
			return file;
		}
	};

	//filter the list of files and return a list of desired files
	ia.prototype.getFiles = function(files){
		var types = $scope.settings.fileTypes;
		var self = this;
		var newfiles = [];
		var goodfiles = [];
		var sequential = [];
		var seqCount = 0;
		var seqSkip = 0;
		var group = {};

		files.forEach(function(file){
			var split = file.name.split('.');
			var ext = split.pop();
			if(['xml','torrent','txt','png','jpg','bmp','gz'].indexOf(ext)>-1){return}
			var name = split.join('')
			if(!group[name]) group[name]={}
			if(!group[name][ext]) group[name][ext]=file;
		})
		Object.keys(group).forEach(function(track){
			var file = {};
			Object.keys(group[track]).forEach(function(type){
				if(group[track][type].artist) file.artist = group[track][type].artist;
				if(group[track][type].album) file.album = group[track][type].album;
				if(group[track][type].title) file.title = group[track][type].title;
				if(group[track][type].length) file.length = group[track][type].length;
				if(group[track][type]['external-identifier']) file['external-identifier']=group[track][type]['external-identifier'];
			})
			file = self.gotId(file);
			delete file['external-identifier'];

			types.some(function(type){
				if(group[track][type]){
					file.name = group[track][type].name
					return true;
				}
			})
			if(file.name){
				newfiles.push(file);
			}
		})

		newfiles.forEach(function(file){
			if(
				((!tools.gibberish(file.title)) &&
				(!tools.gibberish(file.artist)) &&
				(!file.length || tools.duration(file.length) <= self.max_duration))||
				file.musicbrainz_id
			){
				if(file.title){
					var term = file.title.replace(/[^A-Za-z]/g,'');
					if(sequential.indexOf(term) === -1){
						sequential.push(term);
					}else{
						seqCount++
					}
				}else{
					seqSkip++
				}
				goodfiles.push(file);
			}
		});

		//abort the batch if too many files or too many file repeats, ie a sequentional list of same name files
		if(!goodfiles.length || (seqCount && goodfiles.length +seqSkip - seqCount < 5)){
			return false;
		}else{
			return goodfiles;
		}
	};

	//format a file object into a track object for pushing to musicbrainz
	ia.prototype.format=function(file){
		var track={
			metadata:file.metadata,
			id:file.id,
			file:file.url,
			rootdir:file.dir,
			duration:file.duration,
			download:file.url,
			path:'',
			filter:{},
			musicbrainz_id:file.musicbrainz_id,
			type:'internetarchive',
			downloads:file.downloads,
			deleted:'no'
		}
		if(file.musicbrainz_id) track.musicbrainz_id = file.musicbrainz_id;
		return track;
	}

	//fetch the query from the local database and submit to musicbrainz for querying
	var mtimeout;
	ia.prototype.musicbrainz = function(query){
		var self = this;
		clearTimeout(mtimeout);

		if(cpu.load < 75) $scope.db.fetchAll(query).then(function(data){
			if(kill.kill) return;
			data = data.filter(function(track){
				if(self.searches.indexOf(track.id) === -1){
					self.searches.push(track.id);
					return true;
				}
			})
			data = data.map(function(track){
				return self.format(track);
			});

			ipcRenderer.send('musicbrainz',data);

		},function(err){
			console.error(err);
		});

		if(self.progress) mtimeout = setTimeout(function(){
			if(kill.kill) return;
			self.musicbrainz(query);
		},1000)
	}
	ia.prototype.kill=function(){
		this.progress = 0;
		this.searches = [];
		resetq();
		this.getSearches();
	}
	return ia;
}])
