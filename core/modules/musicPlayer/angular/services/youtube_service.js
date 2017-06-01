'use strict';

angular.module('yolk').factory('youtube',['$http',function($http) {

	const {ipcRenderer} = require('electron');
	const path = require('path');

	const tools = require('../../lib/tools/searchtools.js');
	const Tools = require('../../lib/tools/youtubetools.js');
	const log = false;
	const q = Promise;
	var youtubeArtists={};
	var moot = []
	var $scope;
	var done = [];

	var youtube = function(scope){
		$scope = scope;
		this.busy={};
		var self = this;
		$scope.db.fetchAll({index:$scope.db_index,type:'youtubesearch',body:{query:{match:{searched:{query:'yes',type:'phrase'}}}}}).then(function(data){
			done = data.map(function(video){return video.file});
		},function(err){
			console.error(err)
		});
	}

	//Initiate the youtube search
	youtube.prototype.search = function(term){

		var self = this;
		this.progress = 'search';
		if(!Tools.videos[term]) Tools.videos[term]=[];
		var terms = $scope.tools.terms(term);
		var Term = terms.prefix||'';
		if(terms.artist) Term +=' '+terms.artist;
		if(terms.album) Term +=' '+terms.album;
		if(terms.title) Term +=' '+terms.title;
		var self = this;
		var query = 'https://www.googleapis.com/youtube/v3/search?part=snippet&key=AIzaSyBGwfPX9w5DLGlchh93z-K35PAnJCXEgeg&q='+tools.queryBuilder(Term)+'&videoEmbeddable=true&type=video&videoCategoryId=10&maxResults=50'
		Tools.search(query).then(function(ids){
			self.getVideos(ids,term);
		})
	}

	//Get info for each individual found video from youtube
	youtube.prototype.getVideos = function(ids,term){
		var self = this;
		if(ids.length > 50){
			var ids2 = ids.slice(0, 50);
			ids.splice(0,50);
		}else{
			var ids2 = ids.slice(0, ids.length);
			ids=[];
		}

		var query = 'https://www.googleapis.com/youtube/v3/videos?key=AIzaSyBGwfPX9w5DLGlchh93z-K35PAnJCXEgeg&maxResults=50&part=snippet,statistics,contentDetails&id='+ids2.join(',');
		$.get(query).done(function(response){
			if(log) console.log(response.items)
			var bulk = []
			response.items = response.items.filter(function(video){
				bulk.push({index:{_index:$scope.db_index,_type:'youtubesearch',_id:video.id}})
				var duration = Tools.convert_time(video.contentDetails.duration)*1000;
				if(duration < 15*60*1000 && duration > 60000){
					bulk.push({file:video.id});
					return true;
				}else{
					bulk.push({file:video.id,searched:'yes'})
					return false;
				}
			})
			$scope.db.client.bulk({body:bulk,refresh:true},function(err,data){
				if(err) console.error(err);
				if(log) console.log(data)
				Tools.videos[term] = Tools.videos[term].concat(response.items);
				self.progress = Tools.libsize();
				self.getArtist(term);
			})
		}).fail(function(err){
			console.log(err);
		}).always(function(){
			if(ids.length){
				self.getVideos(ids,term);
			}else{
				self.commit(term)
			}
		});
	};
	//get the potential artists for each video
	youtube.prototype.getArtist = function(term){
		if(this.busy[term]) return;
		this.busy[term] = true;
		var self = this;
		var video = Tools.videos[term].shift();

		var artists = [];
		if(!video.retry){
			artists = Tools.artists(video);
		}else{
			Object.keys(Tools.youtubeArtists).forEach(function(artist){
				if(tools.fix(video.snippet.title).indexOf(artist) > -1){
					artists.push(artist)
				}
			})
			if(!artists.length){
				if(log) console.error('NO ARTISTS FOUND: '+video.snippet.title)

				//$scope.db.client.update({index:$scope.db_index,type:'youtubesearch',id:video.id,refresh:"true",body:{doc:{searched:'yes'}}})
				Tools.bulk.push({update:{_index:$scope.db_index,_type:'youtubesearch',_id:video.id}})
				Tools.bulk.push({doc:{searched:'yes'}})
			}else{
				Tools.makeTrack(video,artists);
			}
			self.progress = Tools.libsize();
			self.busy[term] = false;
			if(Tools.videos[term].length) self.getArtist(term);
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
							if(Tools.videos[term].length) self.getArtist(term);
							//self.makeTrack(video,artists)
						})
					}else if(!artists.length){
						Tools.makeTrack(video,gartists);
						self.progress = Tools.libsize();
						self.busy[term] = false;
						if(Tools.videos[term].length) self.getArtist(term);
					}else{
						Tools.bulk.push({update:{_index:$scope.db_index,_type:'youtubesearch',_id:video.id}})
						Tools.bulk.push({doc:{searched:'yes'}})
						self.progress = Tools.libsize();
						self.busy[term] = false;
						if(Tools.videos[term].length) self.getArtist(term);
					}
				}else{
					if(video.statistics.viewCount*1 > 10000){
						Tools.mbArtists(artists).then(function(nartists){
							if(nartists.length){
								Tools.makeTrack(video,nartists);
							}else{
								//$scope.db.client.update({index:$scope.db_index,type:'youtubesearch',id:video.id,refresh:"true",body:{doc:{searched:'yes'}}})
								Tools.bulk.push({update:{_index:$scope.db_index,_type:'youtubesearch',_id:video.id}})
								Tools.bulk.push({doc:{searched:'yes'}})
							}
							self.progress = Tools.libsize();
							self.busy[term] = false;
							if(Tools.videos[term].length) self.getArtist(term);
						})
					}else{
						//$scope.db.client.update({index:$scope.db_index,type:'youtubesearch',id:video.id,refresh:"true",body:{doc:{searched:'yes'}}})
						Tools.bulk.push({update:{_index:$scope.db_index,_type:'youtubesearch',_id:video.id}})
						Tools.bulk.push({doc:{searched:'yes'}})
						self.progress = Tools.libsize();
						self.busy[term] = false;
						if(Tools.videos[term].length) self.getArtist(term);
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
	youtube.prototype.commit = function(term){
		var self = this;
		function go(term){
			if(Tools.bulk && Tools.bulk.length){
				$scope.db.client.bulk({body:Tools.bulk,refresh:true},function(err,data){
					if(err) console.error(err)
					if(log) console.log(data)
				})
				Tools.bulk=[];
			}else{
				var Query = tools.extquery(term,'yt')
				$scope.db.fetchAll({index:$scope.db_index,type:'youtubesearch',body:{query:Query}}).then(function(data){
					data = data.sort(function(a,b){
						return (b.rating*1)-(a.rating*1)
					});
					if(log) console.log('SENT : '+data.length)
					if(data.length) ipcRenderer.send('musicbrainz',data);
				},function(err){
					console.error(err)
				})
			}
			if(Tools.videos[term].length) setTimeout(function(){go(term)},2000)
		}
		go(term);

	}
	/*
	youtube.prototype.kill=function(){
		$scope.youtube.kill = true;
		$scope.youtube.get1.abort();
		$scope.youtube.progress = 0;
	}

	*/
	return youtube;
}])
