'use strict'

/*
 * Establishes a queue of found tracks to submit to the MusicBrainz metadata lookup service. Lookup rate is limited by MusicBrainz as per their
 * rules at http://musicbrainz.org/doc/XML_Web_Service/Rate_Limiting
 *
 * */

const {ipcMain} = require('electron');
const request = require('request');
const path = require('path');
const q = require('promise');
const tools = require('../tools/searchtools.js');
const settings = require('../../musicPlayer.js');
const db_index = settings.db_index.index;
const mb_url="http://musicbrainz.org/ws/2/";
const disam = ['official','stereo','original']
//const mb_query="inc=artist-credits+releases&fmt=json";
const mb_query="inc=artists+releases+tags+media&fmt=json";
const message = process.Yolk.message;
const elastic = process.Yolk.db
const meta = require('../process/meta.js');
const headers = process.Yolk.modules["musicPlayer"].config.headers;
const parse = {
	status:['official','bootleg'],
	type:['album'],
	format:['cd','12" vinyl','7" vinyl','digital media']
}

var musicbrainz = function(){
	this.mbq=[];
	this.pace = 1000; //set the speed limit for MusicBrainz API calls
}

//format musicbrainz response into metadata for track submission to database
musicbrainz.prototype.process = function(tt,track){
	var self = this;
	function verify(item){
		track.metadata.title = item.title;
		track.metadata.artist=item.artist.name;
		track.artist=item.artist.id;
		track.musicbrainz_id = item.id;
		if(track.type !== 'youtube'){
			track.metadata.album = item.release.title;
			track.album = item.release.id;
		}
		if(track.type === 'internetarchive'){
			elastic.update(db_index+'.internetarchivesearch.'+track.id,{musicbrainzed:'yes'}).then(function(data){},function(err){
				console.Yolk.warn(err);
			});
		}
		track.date = Date.now();
		track.musicbrainzed = 'yes';
		if(track.type === 'local'){
			elastic.update(db_index+'.'+track.type+'.'+track.id,track).then(function(data){
				message.send('refresh');
				meta.add(track);
			},function(err){
				console.Yolk.warn(err);
				return;
			});
		}else{
			elastic.put(db_index+'.'+track.type+'.'+track.id,track).then(function(data){
				message.send('refresh');
				meta.add(track);
			},function(err){
				console.Yolk.warn(err);
				return;
			});
		}
	};
	//compare two strings to determine the likelyhood of a comparative match
	var stringCheck = function(title,type){
		//console.log(title);
		//console.log(track.metadata[type]);
		if(title.toLowerCase().trim() === track.metadata[type].toLowerCase().trim()){
			return 1;
		}
		var metas = track.metadata[type].
		toLowerCase().
		replace(/([\(\)\{\}\[\]\:\,'"`’\¦\~\@\#\*])/g,'').
		replace(/_/g,' ').
		trim().
		split(' ');
		//var origTrack = metas.join(' ')

		var got = title.
		toLowerCase().
		replace(/([\(\)\{\}\[\]\:\,'"`’\¦\~\@\#\*])/g,'').
		replace(/_/g,' ').
		trim().
		split(' ');
		//var origIn = got.join(' ')

		var compare = got.filter(function(word){
			if(metas.indexOf(word) > -1){
				var index = metas.indexOf(word);
				metas.splice(index,1);
				return true;
			}
		})
		var rem = metas.length;
		var rem2 = got.length-compare.length;

		//if(compare.length === got.length && (rem < 5 || track.type === 'youtube')){
		if(compare.length === got.length){
			if(rem === 0 && rem2 === 0){
				return 1
			}
			return 2;
		}else if(compare.length){
			if(rem === 0 || rem2===0){
				return 3;
			}
			return rem+rem2;
		}
	}
	//parse over the recording releases and find the best candidate
	var checkRels = function(recording,releases){
		/*
		if(!recording.releases){
			return false;
		}
		*/
		var Release;
		var sorted = {};
		releases.forEach(function(release){
			if(!release.status){
				release.status = 'unknown'
			}
			if(!sorted[release.status.toLowerCase()]){
				sorted[release.status.toLowerCase()]={};
			}
			if(!release['release-group']){
				release['release-group']={
					'primary-type':'unknown'
				}
			}
			if(!sorted[release.status.toLowerCase()][release['release-group']['primary-type'].toLowerCase()]){
				sorted[release.status.toLowerCase()][release['release-group']['primary-type'].toLowerCase()]={}
			}
			if(!release.media[0].format){
				release.media[0].format = 'unknown'
			}
			if(!sorted[release.status.toLowerCase()][release['release-group']['primary-type'].toLowerCase()][release.media[0].format.toLowerCase()]){
				sorted[release.status.toLowerCase()][release['release-group']['primary-type'].toLowerCase()][release.media[0].format.toLowerCase()] = []
			}
			sorted[release.status.toLowerCase()][release['release-group']['primary-type'].toLowerCase()][release.media[0].format.toLowerCase()].push(release);

		})
		var status = parse.status;
		Object.keys(sorted).forEach(function(key){
			if(status.indexOf(key) === -1){
				status.push(key)
			}
		})

		status.every(function(Type){
			if(!sorted[Type]){
				return true;
			}
			var type = parse.type;
			Object.keys(sorted[Type]).forEach(function(key){
				if(type.indexOf(key) === -1){
					type.push(key)
				}
			})

			return type.every(function(Format){
				if(!sorted[Type][Format]){
					return true;
				}
				var format = parse.format;
				Object.keys(sorted[Type][Format]).forEach(function(key){
					if(format.indexOf(key) === -1){
						format.push(key)
					}
				})

				return format.every(function(Releases){
					if(!sorted[Type][Format][Releases]){
						return true;
					}

					sorted[Type][Format][Releases].forEach(function(release){
						var date = new Date(release.date);
						date = Number(date);
						if(typeof date === 'number'){
							if(!Release || Release.date > date){
								Release = release;
								Release.date = date;
							}
						}
					})
				})
			})
		})

		if(!Release){
			Release = releases[0]
		}
		if(!Release){
			return false;
		}
		Release.date = new Date(Release.date);
		return {
			title:recording.title,
			release:Release,
			tags:recording.tags,
			artist:recording['artist-credit'][0].artist,
			id:recording.id
		}
	}
	//parse over the track recordings and find the best candidate
	var checkRecs = function(recordings){

		return new q(function(resolve,reject){
			if(track.type !== 'youtube'){

				function Filter(album){
					if(album){
						//console.Yolk.log(track.metadata.title)

						var titleWeight;
						var foo = recordings.map(function(recording){

							if(recording.releases && recording.releases.length){

								recording.titleWeight = stringCheck(recording.title,'title');
								if(!titleWeight || recording.titleWeight < titleWeight){
									titleWeight = recording.titleWeight;
								}
								return recording;

							}
						})
						/*
						foo.forEach(function(recording){

							console.Yolk.log(recording.title+' : '+track.metadata.title+' = '+recording.titleWeight);
							recording.releases.forEach(function(release){
								console.Yolk.say(release.title)
							})
							console.Yolk.say('+ + + + + + + + + + + + + + ')

						})

						console.Yolk.say('---------------------------------------------------------------------------------------')
						*/
						foo = foo.filter(function(recording){
							if(recording.titleWeight === titleWeight){
								return true;
							}
						})

						foo = foo.map(function(recording){
							if(recording.releases && recording.releases.length){
								var Weight;
								recording.releases = recording.releases.map(function(item){
									var weight = stringCheck(item.title,'album');
									item.weight = weight;
									if(!Weight || weight < Weight){
										Weight = weight;
									}
									return item;
								})
								var Releases = recording.releases.filter(function(release){
									if(release.weight === Weight){
										return true;
									}
								})
								if(Releases.length > 0){
									recording.weight = Weight;
									recording.releases = Releases;
									return recording;
								}
							}
						})

						var weight;
						foo.forEach(function(recording){
							if(!weight || recording.weight < weight){
								weight = recording.weight;
							}
						})
						foo = foo.filter(function(recording){
							if(recording.weight === weight){
								return true;
							}
						})
						return foo;
					}else{
						var foo = recordings.filter(function(recording){
							if(recording.releases && recording.releases.length){
								return true;
							}
						})
						return foo;
					}

				}
				if(track.metadata.album){
					var result = Filter(true);
				}else{
					var result = Filter();
				}
				if(!result.length && track.metadata.album){
					console.Yolk.warn(track);
					result = Filter();
				}
				if(!result.length){
					console.Yolk.error(track);
				}
			}else{
				var result = recordings.filter(function(recording){

					var weight = stringCheck(recording.title,'title');
					if(weight){

						if(!recording.weight || weight < recording.weight){
							//recording.weight = weight;
						}
						recording.weight = weight;
						return true;
					}
				})
				result = result.filter(function(recording){
					if(recording['artist-credit'] && recording['artist-credit'][0]){
						var artist = recording['artist-credit'][0].artist.name;
						if(stringCheck(artist,'artist')){
							return true;
						}
					}else{
						return false;
					}

				})
			}
			if(result.length > 0){

				var releases;
				result.forEach(function(recording){

					if(!releases){
						releases = recording.releases
					}else{
						releases = releases.concat(recording.releases)
					}
				})

				var flags={
					size:1
				}
				var query = 'metadata.title:"'+tools.sanitise(releases[0].title)+'" AND (metadata.artist:'+tools.sanitise(track.metadata.artist)+' OR metadata.artist:"Various Artists")';
				function dedupe(query,recording,releases){
					elastic.fetch(db_index,['albums'],query,flags).then(function(data){
						if(!data.items.length){
							resolve(checkRels(recording,releases));
						}else{
							var id = data.items[0].id;
							var good = releases.filter(function(release){
								if(release.id === id){
									return true;
								}
							})
							if(good.length){
								resolve(checkRels(recording,good));
							}else{
								releases = releases.map(function(release){
									release.id = id;
									return release;
								})
								resolve(checkRels(recording,releases));
							}
						}

					})
				}
				new dedupe(query,result[0],releases);

			}else{
				resolve(false);
			}
		})
	}

	if(track.musicbrainz_id && tt.releases && tt.releases.length){
		//has a musicbrainz id - so verify
		var recording = checkRels(tt,tt.releases);
		verify(recording);
	}else if(tt.recordings && tt.recordings.length){
		//found results for lookup search, so process each result
		var recordings = tt.recordings;

		checkRecs(recordings).then(function(data){
			recording = data
			if(!recording){
				if(track.type === 'internetarchive'){
					elastic.update(db_index+'.internetarchivesearch.'+track.id,{musicbrainzed:'fail'}).then(function(data){},function(err){
						console.Yolk.warn(err);
					});
				}
				return;
			}
			verify(recording)
		});


	}
}

//submit query to musicbrainz server
musicbrainz.prototype.submit = function(track){
	track.deleted = 'no';
	new function(track2,self){
		var options={};
		options.headers = headers;

		//options.url = encodeURI(track2.query);
		options.url = track2.query;
		request.get(options,function(error, response, body){
			if (!error && response.statusCode == 200) {
				try{
					var tt = JSON.parse(body);
				}
				catch(err){
					var tt=false
					console.Yolk.warn(err);
				}
				if(tt){
					try{
						self.process(tt,track2);
					}
					catch(err){
						console.Yolk.error(err);
					}

				}
			}else{
				if(response){
					response = response.toJSON();
					if(response.statusCode === 503){
						if(!track2.resub){
							track2.resub = 1;
						}else{
							track2.resub++;
						}
						self.mbq.unshift(track2);
						self.pacer();
					}
				}
				if(error){
					console.Yolk.warn(error);
					self.pacer();
				}
			}

			message.send('progress',{
				type:'musicbrainz',
				size:self.mbq.length
			});
		})
	}(track,this)

}

//limit the submission rate to musicbrainz server to sane
var resume = false;
musicbrainz.prototype.pacer=function(){
	//console.Yolk.say('pacer: '+this.mbq.length)
	var self = this;
	if(this.timeout || (process.Yolk.musicbrainzQ && process.Yolk.musicbrainzQ.length)){
		if(process.Yolk.musicbrainzQ && process.Yolk.musicbrainzQ.length){
			resume = true;
			setTimeout(function(){
				self.pacer();
			},self.pace);
		}
		return;
	};

	if(resume){
		resume = false;
		setTimeout(function(){
			self.pacer();
		},self.pace);
		return;
	}

	if(this.mbq.length){
		var track = self.mbq.shift();
		self.submit(track);
		this.timeout = setTimeout(function(){
			self.timeout = false;
			self.pacer();
		},self.pace);
	}else{
		this.timeout = false;
	}
}


musicbrainz.prototype.add = function(track){

	var self = this;
	if(dupe(track)){
		return;
	}

	elastic.client.get({
		index:db_index,
		type:track.type,
		id:track.id
	},function(err,data){
		if(data['_source'] && data['_source'].musicbrainzed && data['_source'].musicbrainzed === 'yes'){
			return;
		}else if(err){
			go(track);
		}else{
			go(track);
		}
	});

	function go(track){

		if(track.type === 'youtube'){
			var artist = tools.sanitise(track.metadata.artist);
			artist = tools.uri(artist);
			var recording = tools.sanitise(track.metadata.title);
			recording = tools.uri(recording);
			if(track.canon_title){
				//var query = '?query=(artist:('+artist+') recording:'+recording+') AND (type:(album OR single OR ep OR other))';
				var query = '?query=artist:('+artist+') recording:'+recording;
			}else{
				//var query = '?query=(artist:('+artist+') AND recording:('+recording+')) AND (type:(album OR single OR ep OR other))';
				var query = '?query=artist:('+artist+') AND recording:('+recording+')';
			}
		}else{
			if(track.musicbrainz_id){
				track.query = mb_url+'recording/'+track.musicbrainz_id+'?'+mb_query;
			}else{
				if(track.type === 'local'){
					var title = tools.boost(track.metadata.title,2);
					title = tools.uri(title);
					var artist = tools.sanitise(track.metadata.artist);
					artist = tools.uri(artist);
					var album = tools.sanitise(track.metadata.album);
					album = tools.uri(album);
				}else{
					var title = tools.fuzzy(track.metadata.title,3);
					title = tools.uri(title);
					var artist = tools.fuzzy(track.metadata.artist,5);
					artist = tools.uri(artist);
					var album = tools.fuzzy(track.metadata.album,2);
					album = tools.uri(album);
				}

				var query = '?query=(artist:"'+(artist || "")+'" AND recording:('+(title || "");
				if(album){
					query = query + ') release:('+album
				}
				if(track.type!=='local'){
					query = query + ')) OR (artist:"'+(artist || "")+'" AND recording:('+(title || "");
					if(track.duration){
						query = query+') AND dur:'+track.duration+')'
					}else{
						query = query+'))'
					}
				}else{
					query = query+'))'
				}
			}
		}

		if(!track.query){
			track.query = mb_url+'recording/'+query+'&'+mb_query;
		}
		self.mbq.unshift(track);
		self.pacer()
	}
}
if(!mbz){
	var mbz = new musicbrainz();
}
module.exports = mbz;

//listen for incoming data
ipcMain.on('musicbrainz', function(event, track) {
	mbz.add(track);
})
var dupes = {};
function dupe(track){
	if(!dupes[track.type]){
		dupes[track.type] = []
	}
	if(dupes[track.type].indexOf(track.id) > -1){
		return true;
	}else{
		dupes[track.type].push(track.id);
		return false;
	}
}
