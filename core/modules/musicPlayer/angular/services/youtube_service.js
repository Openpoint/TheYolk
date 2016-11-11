'use strict';

angular.module('yolk').factory('youtube',['$http','$timeout',function($http,$timeout) {
	
	const {ipcRenderer} = require('electron');
	const path = require('path');
	const crypto = require('crypto');

	var loosies = [];
	['!','£','$','%','&','?','~','#'].forEach(function(item){
		loosies.push("(^|\s)"+item+"(\s|$)");
	});	

	var purge;
	var banned;
	var $scope;
	var tools = require('../../lib/tools/searchtools.js');
	
	
	var youtube = function(scope){
		$scope = scope;
		this.avRating = 0;
	}
	youtube.prototype.search = function(term){
		this.term = term;
		var ids=[];
		var videos=[];
		var done = 0;
		var self = this;
		var vidlength = 0;
		
			
		term = encodeURIComponent(term.trim());
		term = term.replace(/%20/g,'+');
		var term_array = term.split('+');
		purge = ['video','official','music','lyrics','lyric','audio','free','full','download','sub','subtitle','subtitles','español','remake','studio','edit','vevo','presents'].filter(function(item){
			if(item === 'vevo' || term_array.indexOf(item) === -1){
				return true;
			}
		});
		banned = ['cover','covers','tribute','jam','festival','unofficial','lesson','lessons','tutorial','tutorials','feature','featurette','unsigned','rehearsal','live','interview','interviews','karaoke','remix','bootleg','intro','preview','lyrics','lyric','tour','choreography','awards','superfans','scene','dance','subtitulado','subtitle','vevo','vevo\'s'].filter(function(item){
			if(term_array.indexOf(item) === -1){
				return true;
			}
		});
		
		$scope.ytTimer = $timeout(function(){
			
			var query = 'https://www.googleapis.com/youtube/v3/search?part=snippet&key=AIzaSyBGwfPX9w5DLGlchh93z-K35PAnJCXEgeg&q='+term+'&videoEmbeddable=true&type=video&videoCategoryId=10&maxResults=50'
			$scope.progress.youtube = 'Searching Youtube';
			getmore(query);

			function getInfo(){
				vidlength = videos.length;
				videos.forEach(function(video){
					
					if(!video.topicDetails){
						video.topicDetails={};
					}
					if(!video.topicDetails.relevantTopicIds){
						video.topicDetails.relevantTopicIds = [];
					}
					if(!video.topicDetails.topicIds){
						video.topicDetails.topicIds = [];
					}
					var topics = video.topicDetails.relevantTopicIds.concat(video.topicDetails.topicIds);
					if(topics.length){
						var query = "https://kgsearch.googleapis.com/v1/entities:search?ids="+topics.join('&ids=')+"&key=AIzaSyBGwfPX9w5DLGlchh93z-K35PAnJCXEgeg";
					}else{
						$scope.progress.youtube = 'Getting Metadata: '+vidlength;
						vidlength --;
						if(vidlength === 0){
							$scope.progress.youtube = false;
							self.commit();
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
			function getvideos(){
				$scope.progress.youtube = 'Fetching '+ids.length+' Videos';
				if(ids.length > 50){
					var ids2 = ids.slice(0, 50);
					ids.splice(0,50);					
				}else{
					var ids2 = ids.slice(0, ids.length);
					ids=[];					
				}
 
				query = 'https://www.googleapis.com/youtube/v3/videos?key=AIzaSyBGwfPX9w5DLGlchh93z-K35PAnJCXEgeg&maxResults=50&part=snippet,statistics,contentDetails,topicDetails&id='+ids2.join(',');
				getmorev(query);				
			};
			
			function getmore(query,token,vid){
				//console.log('Searching youtube');
				if(token){
					var q2 = query+'&pageToken='+token;
				}else{
					var q2 = query;
				}	
				$http({
					method:'GET',
					url:q2,
				}).then(function(response){
					if(response.data.items && response.data.items.length){
						
						response.data.items.forEach(function(item){	

							if(self.filter(term,item.snippet.title,item.snippet.description)){
								ids.push(item.id.videoId);
							}							
						});
						if(response.data.nextPageToken){
							getmore(query,response.data.nextPageToken);
						}						
					}else{
						getvideos();
					}
				},function(err){
					console.log(err);
				});			
			}
			function getmorev(query){
				//console.log('getting videos from youtube');

				$http({
					method:'GET',
					url:query,
				}).then(function(response){
					videos = videos.concat(response.data.items);
					if(ids.length){								
						getvideos();							
					}else{
						getInfo();
					}							
				},function(err){
					console.log(err);
				});				
			}
			

		},2000)
	}
	youtube.prototype.categories = function(video,cats){
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
		var exclude = ['Event','Place','TouristAttraction','City'];
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
		function clean(string){

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
		if(!ditch){
			var purge2 = [];
			purge.forEach(function(item){
				purge2.push('(^|\\s|\\W)'+item+'(\\s|$|\\W|\\O|\\n|\\f|\\r|\\t|\\v)');
			});
			var remove = new RegExp('('+purge2.join('|')+')', "gi");
			loosies = new RegExp(loosies, "g")
			
			if(!title){
				title = {
					name:clean(video.snippet.title),
					canon:false
				}
			}
			if(!artist){
				artist = clean(video.snippet.title);
				if(cats.length > 0){
					//console.log('--------------------------------------------------No Artist------------------------------------------');
					//console.log(title.name);
					//console.log(video);
					//console.log(cats);				
					//console.log('--------------------------------------------------------------------------------------------');
				}
			}else{
				title.name = title.name.replace(artist,'');
			}

			//console.log(title.name);
			//console.log(artist+' : '+title);
			if(!title.canon && cats.length > 0){
				//console.log('--------------------------------------------------No Title------------------------------------------');
				//console.log(title.name);
				//console.log(video);
				//console.log(cats);
				//console.log('--------------------------------------------------------------------------------------------');
			}
			if(title.name.indexOf(this.term) > -1){
				title.boost = true;
			};	
			this.process(video,artist,title);		
		}else{
			//console.log(cats);
			//console.log(video.id);
		}

	}
	
	youtube.prototype.filter = function(term,title,description){
		var isbanned;
		function ban(){
			isbanned = false;

			banned.forEach(function(bann){
				if(title2.indexOf(bann) > -1 || description2.indexOf(bann) > -1){
					isbanned = true;
				}
			});		
		};
		term = tools.strip(term.replace(/\+/g,' ')).split(' ');
		var title2=tools.strip(title).split(' ');
		var description2=tools.strip(description).split(' ');
		ban();
		if(isbanned){
			return false;
		}else{
			return true;
		}
		
	}
	
	function convert_time(duration) {
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
	}
	
	var tracks = [];
	youtube.prototype.process = function(video,artist,title){

		if(video.statistics.viewCount*1 === 0 || !video.statistics.viewCount){
			video.statistics.viewCount=1;
		}
		if(video.statistics.likeCount*1 === 0 || !video.statistics.likeCount){
			video.statistics.likeCount =1;
		}
		if(video.statistics.dislikeCount*1 === 0 || !video.statistics.dislikeCount){
			video.statistics.dislikeCount=1;
		}
		var rating = video.statistics.viewCount;
		//var rating = Math.round((video.statistics.viewCount*video.statistics.likeCount)/video.statistics.dislikeCount);
		video.rating = rating;
		
		var id = crypto.createHash('sha1').update(video.id).digest('hex');
		var track={
			metadata:{
				artist:artist,
				album:'YouTube',
				title:title.name
			},
			id:id,
			file:video.id,
			duration:convert_time(video.contentDetails.duration)*1000,
			download:'https://www.youtube.com/watch?v='+video.id,
			path:'https://www.youtube.com/embed/',
			filter:{},
			type:'youtube',
			rating:video.rating,
			canon_title:title.canon,
			boost:title.boost||false,
		}
		if(track.duration < 15*60*1000 && track.duration > 90000){		
			tracks.push(track);
		}	
	}
	
	
	youtube.prototype.commit = function(){
		var goodtracks=[];
		var allRating=0
		tracks.forEach(function(track){			
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
			if(track.rating*1 > 1000000 || track.rating*1 > avRating || (track.boost && track.rating*1 > 100000)){
				ipcRenderer.send('musicbrainz',track);
			}
			
		});
		tracks=[];
	}
	return youtube;
	
}])
