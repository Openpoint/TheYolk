'use strict';

angular.module('yolk').factory('youtube',['$http','$timeout',function($http,$timeout) {

	const {ipcRenderer} = require('electron');
	const path = require('path');
	const crypto = require('crypto');
	const tools = require('../../lib/tools/searchtools.js');

	var $scope;

	var youtube = function(scope){
		$scope = scope;

	}

	//Initiate the youtube search
	youtube.prototype.search = function(term){
		/*
		var ids=[];
		var videos=[];
		var done = 0;
		var vidlength = 0;
		*/
		term = encodeURIComponent(term.trim());
		term = this.term = term.replace(/%20/g,'+');
		var term_array = this.term_array = term.split('+');

		var self = this;

		var query = 'https://www.googleapis.com/youtube/v3/search?part=snippet&key=AIzaSyBGwfPX9w5DLGlchh93z-K35PAnJCXEgeg&q='+term+'&videoEmbeddable=true&type=video&videoCategoryId=10&maxResults=50'
		$scope.progress.youtube = 'Searching Youtube';
		//console.log(query);
		new getSearch(query,false,self);

	}


	//Get the search results from Youtube and page through them
	function getSearch(query,token,youtube){
		var self = this;
		//make the initial constructors
		if(youtube){
			Object.keys(youtube).forEach(function(key){
				self[key]=youtube[key];
			})
			self.ids=[];
			self.tracks = [];
			self.banned = banned.filter(function(item){
				if(self.term_array.indexOf(item) === -1){
					return true;
				}
			});
			self.purge =purge.filter(function(item){
				if(item === 'vevo' || self.term_array.indexOf(item) === -1){
					return true;
				}
			});
			var purge2 = [];
			self.purge.forEach(function(item){
				purge2.push('(^|\\s|\\W)'+item+'(\\s|$|\\W|\\O|\\n|\\f|\\r|\\t|\\v)');
			});
			self.purge = new RegExp('('+purge2.join('|')+')', "gi");
		}
		if(token){
			var q2 = query+'&pageToken='+token;
		}else{
			var q2 = query;
		}
		$.get(q2).done(function(response){
			if(response.items && response.items.length){
				response.items.forEach(function(item){
					if(self.ban(item.snippet.title,item.snippet.description)){
						self.ids.push(item.id.videoId);
					}
				});
				if(response.nextPageToken){
					getSearch.call(self,query,response.nextPageToken);
				}
			}else{
				self.getVideos();
			}
		}).fail(function(err){
			console.log(err);
			self.getVideos();
		})
	}
	//Get info for each individual found video from youtube
	getSearch.prototype.getVideos = function(){
		var self = this;
		if(!self.videos){
			self.videos=[];
		}
		$scope.progress.youtube = 'Fetching '+this.ids.length+' Videos';
		if(this.ids.length > 50){
			var ids2 = this.ids.slice(0, 50);
			this.ids.splice(0,50);
		}else{
			var ids2 = this.ids.slice(0, this.ids.length);
			this.ids=[];
		}

		var query = 'https://www.googleapis.com/youtube/v3/videos?key=AIzaSyBGwfPX9w5DLGlchh93z-K35PAnJCXEgeg&maxResults=50&part=snippet,statistics,contentDetails,topicDetails&id='+ids2.join(',');
		$.get(query).done(function(response){
			self.videos = self.videos.concat(response.items);

		}).fail(function(err){
			console.log(err);
		}).always(function(){
			if(self.ids.length){
				self.getVideos();
			}else{
				self.getInfo();
			}
		});
	};

	//get the Knowledge Graph details for each video
	getSearch.prototype.getInfo = function(){
		var self = this;
		var vidlength = this.videos.length;
		this.videos.forEach(function(video){
			//console.log(video)
			if(!video.topicDetails){
				video.topicDetails={};
			}
			if(!video.topicDetails.relevantTopicIds){
				video.topicDetails.relevantTopicIds = [];
			}
			if(!video.topicDetails.topicIds){
				video.topicDetails.topicIds = video.topicDetails.relevantTopicIds;
			}
			var topics = video.topicDetails.topicIds;
			if(topics.length){
				var query = "https://kgsearch.googleapis.com/v1/entities:search?ids="+topics.join('&ids=')+"&key=AIzaSyBGwfPX9w5DLGlchh93z-K35PAnJCXEgeg";
			}else{
				$scope.progress.youtube = 'Getting Metadata: '+vidlength;
				vidlength --;
				if(vidlength === 0){
					$scope.progress.youtube = false;
					commit();
				};
				return;
			}

			$http({
				method:'GET',
				url:query,
			}).then(function(response){
				self.categories(video,response.data.itemListElement);
				$scope.progress.youtube = 'Getting Metadata: '+vidlength;
				vidlength --;
				if(vidlength === 0){
					$scope.progress.youtube = false;
					self.commit();
				};
			})
		});
	};

	//strip out videos on the banned keylist
	getSearch.prototype.ban = function(title,description){
		var self = this;
		var isbanned;
		var title2=tools.strip(title).split(' ');
		var description2=tools.strip(description).split(' ');
		function Ban(){
			isbanned = false;
			self.banned.forEach(function(bann){
				if(title2.indexOf(bann) > -1 || description2.indexOf(bann) > -1){
					isbanned = true;
				}
			});
		};
		Ban();
		if(isbanned){
			return false;
		}else{
			return true;
		}
	}

	//scan the categories and attempt to find meaningful metadata
	getSearch.prototype.categories = function(video,cats){
		var self = this;
		var ditch = false;
		var artist = false;
		var title = false;
		var canon =false;
		var titles=[];

		cats.forEach(function(cat){
			if(!artist && cat.result.description && cat.result.name){
				artists.forEach(function(term){
					if (cat.result.description.toLowerCase().indexOf(term) > -1){
						artist = cat.result.name.toLowerCase();
					}
				});
			};
			if(cat.result.name && cat.result['@type'] && cat.result['@type'].indexOf('MusicRecording') > -1){
				titles.push(cat.result.name.toLowerCase());
			}
			exclude.forEach(function(exc){
				if(cat.result['@type'].indexOf(exc) > -1){
					ditch = true;
				}
			});
		})
		if(titles.length === 0 && !artist){
			ditch = true;
		}
		if(!ditch && titles.length > 0){
			var matches = [];
			var vid = tools.strip(video.snippet.title).split(' ');
			titles.forEach(function(title){
				var len = 0;
				var split = tools.strip(title).split(' ');

				split.forEach(function(word){
					if(vid.indexOf(word) > -1){
						len++
					}
				});
				matches.push({
					title:title,
					count:len
				});
			});
			matches = matches.filter(function(match){
				if(match.count > 0){
					return true;
				}
			});
			if(matches.length > 1){
				var biggest = 0;
				matches.forEach(function(match){
					if(match.count > biggest){
						biggest = match.count;
					}
				});
				matches = matches.filter(function(match){
					if(match.count === biggest){
						return true;
					}
				});
			}
			if(matches.length > 1){
				var shortest = matches[0].title.split(' ').length;
				matches.forEach(function(match){
					if(match.title.split(' ').length < shortest){
						shortest = match.title.split(' ').length;
					}
				});
				matches = matches.filter(function(match){
					if(match.title.split(' ').length === shortest){
						return true;
					}
				});
			}
			if(matches.length > 0){
				if(matches[0].title){
					title = {
						name:matches[0].title.toLowerCase(),
						canon:true
					}
				}else{
					title = {
						name:video.snippet.title.toLowerCase(),
						canon:false
					}
				}
			}
		}
		if(!ditch){
			if(!title){
				title = {
					name:Tools.clean(video.snippet.title,purge),
					canon:false
				}
			}
			if(!artist){
				artist = Tools.clean(video.snippet.title);
			}else{
				title.name = title.name.replace(artist,'');
			}
			this.makeTrack(video,artist,title);
		}
	}

	//convert video to Yolk Json structure with metadata
	getSearch.prototype.makeTrack = function(video,artist,title){
		var self = this;
		var track={
			metadata:{
				artist:artist,
				album:'YouTube',
				title:title.name
			},
			id:crypto.createHash('sha1').update(video.id).digest('hex'),
			file:video.id,
			duration:Tools.convert_time(video.contentDetails.duration)*1000,
			download:'https://www.youtube.com/watch?v='+video.id,
			path:'https://www.youtube.com/embed/',
			filter:{},
			type:'youtube',
			rating:video.statistics.viewCount,
			canon_title:title.canon,
			description:video.snippet.description
		}
		if(track.duration < 15*60*1000 && track.duration > 90000){
			self.tracks.push(track);
		}
	}
	//process list of tracks and submit to musicbrainz for tagging
	getSearch.prototype.commit = function(){
		var goodtracks=[];
		var allRating=0
		this.tracks.forEach(function(track){
			var dupe = false;
			for(var i=0; i < goodtracks.length; i++){
				if(track.metadata.artist === goodtracks[i].metadata.artist && track.metadata.title === goodtracks[i].metadata.title){
					dupe = true;
					if(track.rating*1 > goodtracks[i].rating*1){
						goodtracks[i] = track;
					}
				}
			};
			if(!dupe){
				goodtracks.push(track);
			}

		});
		goodtracks.forEach(function(track){
			allRating = allRating+(track.rating*1);
		});

		var avRating = Math.round(allRating/goodtracks.length);

		goodtracks.reverse();
		goodtracks.forEach(function(track){
			//if(track.rating*1 > 1000000 || track.rating*1 > avRating || (track.boost && track.rating*1 > 100000)){
			if(track.rating*1 > 1000000 || track.rating*1 > avRating){
				ipcRenderer.send('musicbrainz',track);
			}

		});
	}

	//list of standalone characters to purge from titles
	var loosies = [];
	['!','£','$','%','&','?','~','#'].forEach(function(item){
		loosies.push("(^|\s)"+item+"(\s|$)");
	});
	loosies = new RegExp(loosies, "g");

	var Tools = {
		convert_time:function(duration) {
			var a = duration.match(/\d+/g);

			if (duration.indexOf('M') >= 0 && duration.indexOf('H') == -1 && duration.indexOf('S') == -1) {
				a = [0, a[0], 0];
			}

			if (duration.indexOf('H') >= 0 && duration.indexOf('M') == -1) {
				a = [a[0], 0, a[1]];
			}
			if (duration.indexOf('H') >= 0 && duration.indexOf('M') == -1 && duration.indexOf('S') == -1) {
				a = [a[0], 0, 0];
			}

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
		},
		clean:function(string,remove){
			string = string.toLowerCase().replace(/(\"|\||\(|\)|\[|\]|\{|\}|\^|\<|\>)/g,' ')
			.replace(/\b(-|\&|\W\&|\.)(?![\w])/g,'')
			.replace(/\ -\ |\/|\\/g,' ')
			.replace(loosies, '').replace(/ +(?= )/g,'')
			.replace(remove,' ')
			.replace(remove,' ')
			.replace(/ +(?= )/g,'')
			.trim();
			return string;
		}

	}
	//list of keywords to exclude video
	var banned =[
		'cover',
		'covers',
		'tribute',
		'jam',
		'festival',
		'unofficial',
		'lesson',
		'lessons',
		'tutorial',
		'tutorials',
		'feature',
		'featurette',
		'unsigned',
		'rehearsal',
		'live',
		'interview',
		'interviews',
		'karaoke',
		'remix',
		'bootleg',
		'intro',
		'preview',
		'lyrics',
		'lyric',
		'tour',
		'choreography',
		'awards',
		'superfans',
		'scene',
		'dance',
		'subtitulado',
		'subtitle',
		'vevo',
		'vevo\'s'
	];
	//list of keywords to get artist name from Knowledgbase tag
	var artists = [
		'band',
		'group',
		'singer',
		'musician',
		'rapper',
		'artist',
		'vocalist',
		'guitarist',
		'pianist',
		'player',
		'duo',
		'trio',
		'quartet',
		'orchestra',
		'chorus',
		'choir',
		'songwriter',
		'composer',
		'dj',
		'producer',
		'character',
		'actor',
		'actress',
		'show',
		'series',
		'game',
		'network',
		'company',
		'corporation',
	];
	//list of keywords from Knowledgbase tag to ditch video if no artist name
	var exclude = [
		'Event',
		'Place',
		'TouristAttraction',
		'City'
	];
	var purge = [
		'video',
		'official',
		'music',
		'lyrics',
		'lyric',
		'audio',
		'free',
		'full',
		'download',
		'sub',
		'subtitle',
		'subtitles',
		'español',
		'remake',
		'studio',
		'edit',
		'vevo',
		'presents'
	]
	return youtube;

}])
