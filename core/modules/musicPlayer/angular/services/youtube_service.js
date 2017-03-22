'use strict';

angular.module('yolk').factory('youtube',['$http','$timeout',function($http,$timeout) {

	const {ipcRenderer} = require('electron');
	const path = require('path');
	const crypto = require('crypto');
	const tools = require('../../lib/tools/searchtools.js');
	const log = false;
	const q = require('promise');
	var youtubeArtists={};
	var moot = []
	var $scope;

	var done = [];

	var youtube = function(scope){
		$scope = scope;
		$scope.db.fetchAll({index:$scope.db_index,type:'youtubesearch',body:{query:{match:{searched:{query:'yes',type:'phrase'}}}}}).then(function(data){
			done = data.map(function(video){return video.file});
		},function(err){
			console.error(err)
		})
	}

	//Initiate the youtube search
	youtube.prototype.search = function(term){
		var terms = $scope.tools.terms(term);
		var Term = terms.prefix||'';
		if(terms.artist) Term +=' '+terms.artist;
		if(terms.album) Term +=' '+terms.album;
		if(terms.title) Term +=' '+terms.title;
		var self = this;
		var query = 'https://www.googleapis.com/youtube/v3/search?part=snippet&key=AIzaSyBGwfPX9w5DLGlchh93z-K35PAnJCXEgeg&q='+tools.queryBuilder(Term)+'&videoEmbeddable=true&type=video&videoCategoryId=10&maxResults=50'
		new getSearch(query,false,term);
	}


	//Get the search results from Youtube and page through them
	function getSearch(query,token,term){

		if(!this.term) this.term = term;
		if(!this.block){
			this.commit();
			this.block = 0
		};
		$timeout(function(){$scope.progress.youtube = 'Searching Youtube'})
		this.block++
		if(log) console.log(this.block)
		if(!this.ids) this.ids=[]
		if(!this.tracks) this.tracks= []
		if(!this.bulk) this.bulk = []
		var self = this;

		if(token){
			var q2 = query+'&pageToken='+token;
		}else{
			var q2 = query;
		}
		$.get(q2).done(function(response){

			if(response.items && response.items.length){
				if(log) console.log(response.items)
				response.items.forEach(function(item){
					if(done.indexOf(item.id.videoId) === -1){
						self.ids.push(item.id.videoId);
						done.push(item.id.videoId)
					}
				});
				if(response.nextPageToken && self.block < 2){
					getSearch.call(self,query,response.nextPageToken);
				}else{
					if(!self.ids.length){
						$timeout(function(){$scope.progress.youtube = false})
						return;
					}
					self.getVideos(self.ids);
					self.ids=[]
				}
			}else{
				if(!self.ids.length){
					$timeout(function(){$scope.progress.youtube = false})
					return;
				}
				self.getVideos(self.ids);
				self.ids=[]
			}
		}).fail(function(err){
			console.log(err);
			if(!self.ids.length){
				$timeout(function(){$scope.progress.youtube = false})
				return;
			}
			self.getVideos(self.ids);
			self.ids=[]
		})
	}
	//Get info for each individual found video from youtube
	getSearch.prototype.getVideos = function(ids){

		var self = this;
		if(!self.videos){
			self.videos=[];
		}

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
			self.videos = self.videos.concat(response.items);

		}).fail(function(err){
			console.log(err);
		}).always(function(){
			if(ids.length){
				//self.getVideos(ids);
			}else{
				var bulk = []

				self.videos = self.videos.filter(function(video){
					bulk.push({index:{_index:$scope.db_index,_type:'youtubesearch',_id:video.id}})
					var duration = Tools.convert_time(video.contentDetails.duration)*1000;
					if(duration < 15*60*1000 && duration > 60000){
						bulk.push({file:video.id})
						return true
					}else{
						bulk.push({file:video.id,searched:'yes'})
					}
				})
				$scope.db.client.bulk({body:bulk,refresh:true},function(err,data){
					if(err) console.error(err);
					if(log) console.log(data)
					self.getArtists();
				})
			}
		});
		if(ids.length) self.getVideos(ids);
	};
	var wikidata = function(string){
		var artists = []
		var disambig = []
		return new q(function(resolve,reject){
			var query = 'https://www.wikidata.org/w/api.php?action=wbgetentities&sites=enwiki&'+string+'&languages=en&format=json';
			$.get(query).done(function(response){
				Object.keys(response.entities).forEach(function(key){
					if(Number(key)){return}
					var item = response.entities[key];
					if(item.claims && item.claims.P434){
						artists.push(tools.fix(item.labels.en.value))
					}
					if(item.descriptions && item.descriptions.en && item.descriptions.en.value === 'Wikimedia disambiguation page'){
						if(item.labels && item.labels.en){disambig.push(item.labels.en.value)}
					}
				})
				resolve({artists:artists,disambig:disambig})
			}).fail(function(err){
				console.error(err);
				resolve(false)
			})
		})
	}
	var checkArtists = function(artists){
		var cartists=[];
		return new q(function(resolve,reject){
			var titles = []
			artists.forEach(function(artist){
				if(!artist.length){return}
				if(youtubeArtists[tools.fix(artist)]){
					cartists.push(tools.fix(artist))
					return;
				}
				titles.push(tools.queryBuilder(artist.toUpperCase()))
				titles.push(tools.queryBuilder(artist.replace(/\b(\w)/g,function(init){return init.toUpperCase()})))
			})
			if(!titles.length && cartists.length){resolve(cartists)}
			if(!titles.length){
				resolve(false);
				return;
			}
			var string = 'titles='+titles.join('|');
			wikidata(string).then(function(lookup){
				if(!lookup){
					resolve(false);
					return;
				}
				if(!lookup.disambig.length){
					resolve(cartists.concat(lookup.artists))
				}else{
					var count = 0;
					var ids = [];
					lookup.disambig.forEach(function(artist){
						count++
						var query = 'https://www.wikidata.org/w/api.php?action=wbsearchentities&search='+tools.queryBuilder(artist)+'&language=en&format=json';
						$.get(query).done(function(response){
							response.search.forEach(function(result){
								ids.push(result.id)
							})

						}).fail(function(err){
							console.error(err)
						}).always(function(){
							count--;
							if(count === 0){
								wikidata('ids='+ids.join('|')).then(function(lookup){
									if(!lookup){
										resolve(false);
										return;
									}
									resolve(cartists.concat(lookup.artists))
								})
							}
						})
					})
				}
			})

		})
	}
	var mbArtists = function(artists){
		artists = artists.filter(function(artist,pos,self){
			if(artist.trim().length > 2 && self.indexOf(artist) === pos){return true}
		})
		return new q(function(resolve,reject){
			if(!artists.length) {
				resolve([]);
				return;
			}
			var count = 0
			var mbartists = []
			artists.forEach(function(artist){
				ipcRenderer.send('musicbrainz_artist',artist);
				ipcRenderer.once('mb_'+artist,function(event,data){
					if(data && data.key) youtubeArtists[data.key]={canon:data.canon}
					if(data && data.key) mbartists.push(data.key)
					count++
					if(log) console.log(count+' : '+artists.length)
					if(count===artists.length){
						resolve(mbartists)
					}
				})
			})
		})
	}
	var fixTitle = function(title,artists){
		title = tools.fix(title);
		artists.forEach(function(name){
			name = tools.fix(name);
			name = name.replace(/([^a-z0-9])/g,function(char){return '\\'+char})
			var regex = new RegExp('([^0-9a-z]|^| )'+name+'( |$|[^0-9a-z])','g');
			title = title.replace(regex,' ').trim().replace(/^([^0-9a-z]*) | ([^0-9a-z]*)$/g,' ');
			title = tools.despace(tools.fix(title));
		})
		if(!title.length){return false}
		return title;
	}

	var fixTrack=function(track,Title,artists){
		track.metadata.title = fixTitle(Title,artists);
		if(!track.metadata.title){return false}
		track.disambig=[];
		function pf(title){
			var postfix = tools.postfix(title);
			if(postfix){
				track.metadata.title = postfix.prefix;
				track.disambig.push({dis:postfix.postfix});
				pf(track.metadata.title)
			}
		}
		pf(track.metadata.title)

		track.metadata.title = track.metadata.title.split(/ ft([\s]|[^0-9a-z])| feat([\s]|[^0-9a-z])/g)[0];
		pf(track.metadata.title);
		artists = artists.map(function(artist){
			if(youtubeArtists[artist] && youtubeArtists[artist].canon){
				return youtubeArtists[artist].canon
			}else{
				return artist
			}
		})
		track.metadata.artist = artists.shift();
		if(artists.length){
			track.artists=artists.map(function(artist){return {name:artist}});
		}
		return track;
	}

	//get the potential artists for each video
	getSearch.prototype.getArtists = function(){
		if(!this.videos.length){
			$timeout(function(){$scope.progress.youtube = false})
			return;
		}
		var self = this;
		var video = this.videos.shift();
		$timeout(function(){$scope.progress.youtube = 'Fetching '+self.videos.length+' Videos'})

		if(log) console.log('-------------------------------------------------------------------------------------------------------------------')
		if(log) console.log(video.snippet.title)

		var artists = [];

		if(!video.retry){
			video.snippet.title = video.snippet.title.replace(/[a-z]-([A-Z]|[^a-zA-Z])/g,function(char){
				return char.split().join(' ')
			})

			var split = video.snippet.title.split(/ -|- | - |  |\~|\/|\:| \:| \: |\: /);
			if(split.length > 1){
				if(youtubeArtists[tools.fix(split[1])]) split.reverse();

				split[0].replace(/\&/g,' and ').toLowerCase().split(/\,| and | ft(?: |[^0-9a-z])| feat(?: |[^0-9a-z])| vs(?: |[^0-9a-z])| with |\//g).forEach(function(art){
					art = tools.fix(art);
					if(art){artists.push(art)}
				})
			}else{
				var retry = false;
				var postfix = tools.postfix(video.snippet.title)
				Object.keys(youtubeArtists).forEach(function(artist){
					if(tools.fix(video.snippet.title).indexOf(artist) === 0){
						artists.push(artist)
						retry = true;
					}
					if(tools.fix(postfix.prefix||video.snippet.title).endsWith(artist)){
						artists.push(artist)
						retry = true;
					}
				})
				if(!retry){
					if(video.statistics.viewCount*1 > 1000000){
						if(video.snippet.tags){
							video.snippet.tags = video.snippet.tags.reverse()
							var tags = video.snippet.tags.map(function(tag){
								tag = tag.replace(/[\(\{\[](.*?)[\)\}\]]/g,' ')
								tag = $scope.tools.fix(tag)
								return tag;
							})
						}
						if(video.snippet.description) var description = $scope.tools.fix(video.snippet.description);
						if(tags && description){
							tags.forEach(function(tag){
								if(description.indexOf(tag) > -1){artists.push(tag)}
							})
						}
					}
				}
			};
		}else{
			Object.keys(youtubeArtists).forEach(function(artist){
				if(tools.fix(video.snippet.title).indexOf(artist) > -1){
					artists.push(artist)
				}
			})
		}

		if(artists.length){

			checkArtists(artists).then(function(gartists){
				if(gartists && gartists.length){
					if(log) console.log(gartists);
					gartists.forEach(function(art){
						if(!youtubeArtists[art]) youtubeArtists[art] = {}
					})
					artists = artists.filter(function(artist){
						if(gartists.indexOf(artist)===-1){return true}
					})
					if(artists.length && video.statistics.viewCount*1 > 10000){
						if(log) console.warn(artists)
						mbArtists(artists).then(function(artists){
							var artists = gartists.concat(artists);
							self.makeTrack(video,artists)
							if(self.videos.length){self.getArtists()}else{self.commit()}
						})
					}else{
						self.makeTrack(video,gartists)
						if(self.videos.length){self.getArtists()}else{self.commit()}
					}

				}else{

					if(video.statistics.viewCount*1 > 10000){

						mbArtists(artists).then(function(nartists){
							if(nartists.length){
								self.makeTrack(video,nartists)
							}else{
								//$scope.db.client.update({index:$scope.db_index,type:'youtubesearch',id:video.id,refresh:"true",body:{doc:{searched:'yes'}}})
								self.bulk.push({update:{_index:$scope.db_index,_type:'youtubesearch',_id:video.id}})
								self.bulk.push({doc:{searched:'yes'}})
							}
							if(self.videos.length){self.getArtists()}else{self.commit()}
						})
					}else{
						//$scope.db.client.update({index:$scope.db_index,type:'youtubesearch',id:video.id,refresh:"true",body:{doc:{searched:'yes'}}})
						self.bulk.push({update:{_index:$scope.db_index,_type:'youtubesearch',_id:video.id}})
						self.bulk.push({doc:{searched:'yes'}})
						if(self.videos.length){self.getArtists()}else{self.commit()}
					}

				}
			})
		}else if(video.retry){
			if(log) console.error('NO ARTISTS FOUND: '+video.snippet.title)
			//$scope.db.client.update({index:$scope.db_index,type:'youtubesearch',id:video.id,refresh:"true",body:{doc:{searched:'yes'}}})
			this.bulk.push({update:{_index:$scope.db_index,_type:'youtubesearch',_id:video.id}})
			this.bulk.push({doc:{searched:'yes'}})
			if(this.videos.length){self.getArtists()}else{self.commit()};
		}else{
			video.retry = true;
			self.videos.push(video);
			self.getArtists()
		}
	};



	//convert video to Yolk Json structure with metadata
	getSearch.prototype.makeTrack = function(video,artists){
		var self = this;
		var title = video.snippet.title

		var track={
			metadata:{
				album:'YouTube',
				title:title
			},
			id:crypto.createHash('sha1').update(video.id).digest('hex'),
			file:video.id,
			duration:Tools.convert_time(video.contentDetails.duration)*1000,
			download:'https://www.youtube.com/watch?v='+video.id,
			path:'https://www.youtube.com/embed/',
			filter:{},
			type:'youtube',
			rating:video.statistics.viewCount,
			canon_title:video.snippet.title,
			description:video.snippet.description,
			musicbrainzed:'no',
			searched:'yes'
		}

		track = fixTrack(track,title,artists);

		if(!track){return}
		//$scope.db.client.update({index:$scope.db_index,type:'youtubesearch',id:video.id,refresh:"true",body:{doc:track}})
		this.bulk.push({update:{_index:$scope.db_index,_type:'youtubesearch',_id:video.id}})
		this.bulk.push({doc:track})
	}





	//process list of tracks and submit to musicbrainz for tagging
	getSearch.prototype.commit = function(){
		var self = this;
		$timeout(function(){$scope.progress.youtube = false})

		if(this.bulk && this.bulk.length){
			$scope.db.client.bulk({body:this.bulk,refresh:true},function(err,data){
				if(err) console.error(err)
				if(log) console.log(data)
				self.commit();
			})
			this.bulk=[];
			return;
		}

		var Query = tools.extquery(this.term,'yt')

		$scope.db.fetchAll({index:$scope.db_index,type:'youtubesearch',body:{query:Query}}).then(function(data){

			data = data.sort(function(a,b){
				return (b.rating*1)-(a.rating*1)
			});
			if(log) console.log('SENT : '+data.length)

			if(data.length) data.forEach(function(track){
				ipcRenderer.send('musicbrainz',track);
			})
		},function(err){
			console.error(err)
		})
	}

	var Tools = {
		convert_time:function(duration) {
			var a = duration.match(/\d+/g);
			if (duration.indexOf('M') >= 0 && duration.indexOf('H') == -1 && duration.indexOf('S') == -1) {a = [0, a[0], 0];}
			if (duration.indexOf('H') >= 0 && duration.indexOf('M') == -1) {a = [a[0], 0, a[1]];}
			if (duration.indexOf('H') >= 0 && duration.indexOf('M') == -1 && duration.indexOf('S') == -1) {a = [a[0], 0, 0];}
			duration = 0;
			if (a.length == 3) {
				duration = duration + parseInt(a[0]) * 3600;
				duration = duration + parseInt(a[1]) * 60;
				duration = duration + parseInt(a[2]);
			}
			if (a.length == 2) {
				duration = duration + parseInt(a[0]) * 60;
				duration = duration + parseInt(a[1]);
			}
			if (a.length == 1) {
				duration = duration + parseInt(a[0]);
			}
			return duration
		}
	}
	return youtube;
}])
