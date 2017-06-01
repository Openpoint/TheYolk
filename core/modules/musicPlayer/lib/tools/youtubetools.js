"use strict";

const q = Promise;
const log = false;
const tools = require('./searchtools.js');
const {ipcRenderer} = require('electron');
const crypto = require('crypto');

var youtubetools = function(){
	this.youtubeArtists={};
	this.bulk=[];
	this.videos={};
	this.db_index = require('../../musicPlayer.js').db_index.index;
};

youtubetools.prototype.search =function(query){
	return new q(function(resolve,reject){
		var ids=[];
		var block = 0;
		function submit(token){
			var q2 = token ? query+'&pageToken='+token : query;
			$.get(q2).done(function(response){
				if(response.items && response.items.length){
					if(log) console.log(response.items)
					response.items.forEach(function(item){
						ids.push(item.id.videoId);
					});
					if(response.nextPageToken && block < 2){
						submit(response.nextPageToken);
						block++;
					}else{
						resolve(ids);
					}
				}else{
					resolve(ids);
				}
			}).fail(function(err){
				console.log(err);
				resolve(ids);
			})
		}
		submit()
	})
}
youtubetools.prototype.convert_time = function(duration) {
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

youtubetools.prototype.artists = function(video){
	var artists = [];

	video.snippet.title = video.snippet.title.replace(/[a-z]-([A-Z]|[^a-zA-Z])/g,function(char){
		return char.split().join(' ')
	})

	var split = video.snippet.title.split(/ -|- | - |  |\~|\/|\:| \:| \: |\: /);
	if(split.length > 1){
		if(this.youtubeArtists[tools.fix(split[1])]) split.reverse();
		split[0].replace(/\&/g,' and ').toLowerCase().split(/\,| and | ft(?: |[^0-9a-z])| feat(?: |[^0-9a-z])| vs(?: |[^0-9a-z])| with |\//g).forEach(function(art){
			art = tools.fix(art);
			if(art){artists.push(art)}
		})
	}else{
		var retry = true;
		var postfix = tools.postfix(video.snippet.title)
		Object.keys(this.youtubeArtists).forEach(function(artist){
			if(tools.fix(video.snippet.title).indexOf(artist) === 0){
				artists.push(artist)
				retry = false;
			}
			if(tools.fix(postfix.prefix||video.snippet.title).endsWith(artist)){
				artists.push(artist)
				retry = false;
			}
		})
		if(retry){
			if(video.statistics.viewCount*1 > 1000000){
				if(video.snippet.tags){
					video.snippet.tags = video.snippet.tags.reverse()
					var tags = video.snippet.tags.map(function(tag){
						tag = tag.replace(/[\(\{\[](.*?)[\)\}\]]/g,' ')
						tag = tools.fix(tag)
						return tag;
					})
				}
				if(video.snippet.description) var description = tools.fix(video.snippet.description);
				if(tags && description){
					tags.forEach(function(tag){
						if(description.indexOf(tag) > -1){artists.push(tag)}
					})
				}
			}
		}
	}
	return artists;
};

youtubetools.prototype.checkArtists = function(artists){
	var self = this;
	var cartists=[];
	return new q(function(resolve,reject){
		var titles = []
		artists.forEach(function(artist){
			if(!artist.length){return}
			if(self.youtubeArtists[tools.fix(artist)]){
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
		//check wikipedia for artist
		wikidata(string).then(function(lookup){
			if(!lookup){
				resolve(false);
				return;
			}
			if(lookup.artists.length){
				lookup.artists.forEach(function(art){self.youtubeArtists[art] = {}});
				cartists = cartists.concat(lookup.artists)
			}

			if(!lookup.disambig.length){
				resolve(cartists)
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

youtubetools.prototype.mbArtists = function(artists){
	var self = this;
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
				if(data && data.key) self.youtubeArtists[data.key]={canon:data.canon}
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

youtubetools.prototype.makeTrack = function(video,artists,db_index){
	var self = this;
	var title = video.snippet.title
	var track={
		metadata:{
			album:'YouTube',
			title:title
		},
		id:crypto.createHash('sha1').update(video.id).digest('hex'),
		file:video.id,
		duration:self.convert_time(video.contentDetails.duration)*1000,
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

	var track2 = this.fixTrack(track,title,artists);
	if(track2){
		this.bulk.push({update:{_index:this.db_index,_type:'youtubesearch',_id:video.id}})
		this.bulk.push({doc:track2})
		return track2;
	}else{
		this.bulk.push({update:{_index:this.db_index,_type:'youtubesearch',_id:video.id}})
		this.bulk.push({doc:{id:track.id,searched:'yes'}})
		return false;
	}

	//$scope.db.client.update({index:$scope.db_index,type:'youtubesearch',id:video.id,refresh:"true",body:{doc:track}})
	//this.bulk.push({update:{_index:$scope.db_index,_type:'youtubesearch',_id:video.id}})
	//this.bulk.push({doc:track})
}

youtubetools.prototype.fixTrack=function(track,Title,artists){
	var self = this;
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
		if(self.youtubeArtists[artist] && self.youtubeArtists[artist].canon){
			return self.youtubeArtists[artist].canon
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

youtubetools.prototype.libsize = function(){
	var self = this;
	var size = 0;
	Object.keys(self.videos).forEach(function(term){
		if(self.videos.hasOwnProperty(term)) size+=self.videos[term].length;
	})
	return size
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

module.exports = new youtubetools();
