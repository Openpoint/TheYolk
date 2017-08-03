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

angular.module('yolk').factory('youtube',['$http',function($http) {

	const {ipcRenderer} = require('electron');
	const path = require('path');

	const tools = require('../../lib/tools/searchtools.js');
	const Tools = require('../../lib/tools/youtubetools.js');
	const log = false;
	const kill = require('../../lib/tools/killer.js')
	var moot = []
	var $scope;

	var youtube = function(scope){
		$scope = scope;
		this.busy={};
		var self = this;
		this.getDone();
		$scope.db.client.get({index:$scope.db_index,id:1,type:'youtubeartists'},function(err,data){
			if(data._source) {Tools.youtubeArtists = data._source.arts};
		})
	}
	youtube.prototype.resume=function(scope){
		$scope = scope;
		return this;
	}
	youtube.prototype.getDone = function(){
		if(log) console.log('getDone');
		$scope.db.fetchAll({index:$scope.db_index,type:'youtubesearch',body:{query:{match:{searched:{query:'yes',type:'phrase'}}}}}).then(function(data){
			if(kill.kill) return;
			data = data.filter(function(v){
				if(v.musicbrainzed === 'no'){
					return false;
				}else{
					return true;
				}
			})
			Tools.done = data.map(function(video){return video.file});
		},function(err){
			console.error(err)
		});
	}
	//Initiate the youtube search
	youtube.prototype.search = function(term){
		if(log) console.log('search');
		kill.kill = false;
		var self = this;
		this.progress = 'search';
		if(!Tools.videos[term]) Tools.videos[term]=[];
		var terms = tools.terms(term);
		var Term = terms.prefix||'';
		if(terms.artist) Term +=' '+terms.artist;
		if(terms.album) Term +=' '+terms.album;
		if(terms.title) Term +=' '+terms.title;
		var self = this;
		var query = 'https://www.googleapis.com/youtube/v3/search?part=snippet&key=AIzaSyBGwfPX9w5DLGlchh93z-K35PAnJCXEgeg&q='+tools.queryBuilder(Term)+'&videoEmbeddable=true&type=video&videoCategoryId=10&maxResults=50'
		Tools.search(query).then(function(ids){
			ids = ids.filter(function(id){
				return Tools.done.indexOf(id) === -1;
			});
			if(ids.length){
				self.getVideos(ids,term)
			}else{
				self.progress = 0;
			}
		})
	}

	//Get info for each individual found video from youtube
	youtube.prototype.getVideos = function(ids,term){
		if(log) console.log('getVideos');
		var self = this;
		if(ids.length > 50){
			var ids2 = ids.slice(0, 50);
			ids.splice(0,50);
		}else{
			var ids2 = ids.slice(0, ids.length);
			ids=[];
		}

		var query = 'https://www.googleapis.com/youtube/v3/videos?key=AIzaSyBGwfPX9w5DLGlchh93z-K35PAnJCXEgeg&maxResults=50&part=snippet,statistics,contentDetails&id='+ids2.join(',');
		var r = $.get(query).done(function(response){
			var bulk = []
			response.items = response.items.filter(function(video){
				bulk.push({index:{_index:$scope.db_index,_type:'youtubesearch',_id:video.id}})
				var duration = Tools.convert_time(video.contentDetails.duration)*1000;
				if(duration < 15*60*1000 && duration > 60000){
					bulk.push({file:video.id});
					return true;
				}else{
					Tools.done.push(video.id)
					bulk.push({file:video.id,searched:'yes'})
					return false;
				}
			})


			$scope.db.client.bulk({body:bulk,refresh:true},function(err,data){
				if(kill.kill) return;
				if(err) console.error(err);
				if(response.items.length){
					Tools.videos[term] = Tools.videos[term].concat(response.items);
					self.getArtist(term);
				}
				self.progress = Tools.libsize();
			})
		}).fail(function(err){
			console.error(err);
		}).always(function(){
			kill.update('requests')
			if(kill.kill) return;
			if(ids.length){
				self.getVideos(ids,term);
			}

		});
		kill.requests.push(r);
	};
	//get the potential artists for each video
	youtube.prototype.getArtist = function(term){
		if(log) console.log('getArtist');
		if(this.busy[term]) return;
		var self = this;
		if(!Tools.videos[term].length){
			self.progress = Tools.libsize();
			self.commit(term);
			return;
		}
		this.busy[term] = true;
		var video = Tools.videos[term].shift();
		var artists = [];
		if(!video.retry){
			artists = Tools.artists(video);
		}else{
			Object.keys(Tools.youtubeArtists).forEach(function(artist){
				if(Tools.youtubeArtists[artist].nope) return;
				if(tools.fix(video.snippet.title).indexOf(artist) > -1){
					artists.push(artist)
				}
			})
			if(!artists.length){
				if(log) console.error('NO ARTISTS FOUND: '+video.snippet.title)

				Tools.done.push(video.id)
				Tools.bulk.push({update:{_index:$scope.db_index,_type:'youtubesearch',_id:video.id}})
				Tools.bulk.push({doc:{searched:'yes'}})
			}else{
				Tools.makeTrack(video,artists);
			}
			self.progress = Tools.libsize();
			self.busy[term] = false;
			self.getArtist(term);
			return;
		}
		if(artists.length){
			Tools.checkArtists(artists).then(function(gartists){
				if(gartists && gartists.length){

					artists = artists.filter(function(artist){
						if(gartists.indexOf(artist)===-1){return true}
					})
					if(artists.length && video.statistics.viewCount*1 > 10000){
						Tools.mbArtists(artists).then(function(artists){
							var artists = gartists.concat(artists);
							Tools.makeTrack(video,artists);
							self.progress = Tools.libsize();
							self.busy[term] = false;
							self.getArtist(term);
						})
					}else if(!artists.length){
						Tools.makeTrack(video,gartists);
						self.progress = Tools.libsize();
						self.busy[term] = false;
						self.getArtist(term);
					}else{
						Tools.done.push(video.id)
						Tools.bulk.push({update:{_index:$scope.db_index,_type:'youtubesearch',_id:video.id}})
						Tools.bulk.push({doc:{searched:'yes'}})
						self.progress = Tools.libsize();
						self.busy[term] = false;
						self.getArtist(term);
					}
				}else{
					if(video.statistics.viewCount*1 > 10000){
						Tools.mbArtists(artists).then(function(nartists){
							if(nartists.length){
								Tools.makeTrack(video,nartists);
							}else{
								Tools.done.push(video.id)
								Tools.bulk.push({update:{_index:$scope.db_index,_type:'youtubesearch',_id:video.id}})
								Tools.bulk.push({doc:{searched:'yes'}})
							}
							self.progress = Tools.libsize();
							self.busy[term] = false;
							self.getArtist(term);
						})
					}else{
						Tools.done.push(video.id)
						Tools.bulk.push({update:{_index:$scope.db_index,_type:'youtubesearch',_id:video.id}})
						Tools.bulk.push({doc:{searched:'yes'}})
						self.progress = Tools.libsize();
						self.busy[term] = false;
						self.getArtist(term);
					}
				}
			})
		}else{
			video.retry = true;
			Tools.videos[term].push(video);
			self.progress = Tools.libsize();
			self.busy[term] = false;
			self.getArtist(term)
		}
	};
	//process list of tracks and submit to musicbrainz for tagging
	//var ctimeout = {};
	youtube.prototype.commit = function(term){
		if(log) console.log('commit');
		//if(ctimeout[term]) return;
		var self = this;
		function go(term){
			if(Tools.bulk && Tools.bulk.length){
				if(log) console.log('commit bulk')
				$scope.db.client.bulk({body:Tools.bulk,refresh:true},function(err,data){
					if(kill.kill) return;
					if(err) console.error(err)
					if(log) console.log(data)
					go(term)
					self.getDone();
				})
				Tools.bulk=[];
				//clearTimeout(ctimeout[term])
			}else{
				var Query = tools.extquery(term,'yt')
				if(log) console.log('commit query')
				$scope.db.fetchAll({index:$scope.db_index,type:'youtubesearch',body:{query:Query}}).then(function(data){
					if(kill.kill) return;
					data = data.sort(function(a,b){
						return (b.rating*1)-(a.rating*1)
					});
					if(log) console.log('SENT : '+data.length)
					if(data.length) ipcRenderer.send('musicbrainz',data);
				},function(err){
					console.error(err)
				})
				$scope.db.client.update({index:$scope.db_index,type:'youtubeartists',id:1,doc_as_upsert:true,refresh:true,body:{doc:{arts:Tools.youtubeArtists}}},function(err,data){
					if(err) console.error(err);
				})
			}
		}
		go(term);
	}

	youtube.prototype.kill=function(){
		if(log) console.log('kill');
		Tools.Kill();
		this.progress = Tools.libsize();
		this.getDone();
		this.busy = {};
	}

	return youtube;
}])
