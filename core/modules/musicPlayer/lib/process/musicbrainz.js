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
const mb_url="https://musicbrainz.org/ws/2/";
const message = process.Yolk.message;
const elastic = process.Yolk.db
const meta = require('../process/meta.js');
const headers = process.Yolk.modules["musicPlayer"].config.headers;
var preferred_release = 'GB';
const mbq={
	album:[],
	youtube:[],
	other:[]
};
var kill = false;
var busy = false;

var musicbrainz = function(){
	this.pace = 1000; //set the speed limit for MusicBrainz API calls
}

var saveMeta = function(type,body){
	if(kill){
		return;
	}

	var tosave = {}
	var artwork = {
		type:type,
		id:body.id.toString()
	};
	if(body.relations.length){
		tosave.links = {};
		body.relations.forEach(function(link){
			if (link.type === 'discogs'){
				artwork.discogs = link.url.resource+'/images';
			}
			if(type === 'artist'){
				artwork.images = [];
				if(link.type === 'image'){
					artwork.images.push(link.url.resource);
				}
				if(link.type === 'official homepage'){
					tosave.links.home = link.url.resource;
				}
				if(link.type === 'wikipedia'){
					tosave.links.wikipedia = link.url.resource;
				}
			}
		})
		//console.Yolk.warn(tosave)
	}

	switch (type){
		case 'artist':
			tosave.country = body.country;
			tosave.id = body.id.toString();
			tosave.name = fix(body.name);
			artwork.name = fix(body.name);
			save();
		break;
		case 'album':

			if(body['cover-art-archive'] && body['cover-art-archive'].front){
				artwork.coverart = body['cover-art-archive'].front;
			};
			tosave.metadata={
				title:fix(body.title),
				artist:fix(body['artist-credit'][0].name)
			}
			artwork.artist = fix(body['artist-credit'][0].name);
			artwork.name = fix(body.title);
			tosave.id = body.id.toString();
			if(body['release-group'] && body['release-group']['first-release-date']){
				tosave.release_date = Number(new Date(body['release-group']['first-release-date']));
			}
			tosave.artist = body['artist-credit'][0].artist.id
			tosave.tracks=[];
			tosave.primary_type = body['release-group']['primary-type'] ? body['release-group']['primary-type'].toLowerCase():'unknown';
			tosave.secondary_type = body['release-group']['secondary-type']&&body['release-group']['secondary-type'].length&&tosave.primary_type!=='unknown' ? body['release-group']['secondary-type'][0].toLowercase():'lp';
			var count = 1;
			if(body.media && body.media.length){
				body.media.forEach(function(media){
					//tosave.tracks['media-'+count]={};
					var count2 = 1;
					media.tracks.forEach(function(track){
						tosave.tracks.push({
							disc:count,
							position:count2,
							title:fix(track.recording.title),
							id:track.recording.id.toString(),
							artist:{
								name:fix(track['artist-credit'][0].artist.name),
								id:track['artist-credit'][0].artist.id.toString()
							}
						})
						count2++;
					})
					count++;
				})
			}
			//first check if a different release of the same album already exists
			elastic.client.search({
				index:db_index,
				type:'album',
				body:{query:{bool:{must:[
					{match:{'metadata.title.exact':{
						query:body.title,
					}}},
					{match:{'metadata.artist':{
						query:fix(body['artist-credit'][0].name),
						operator:'and'
					}}}
				]}}}
			},function(err,data){
				if(err){
					console.Yolk.error(err);
					busy = false;
					mbz.pacer();
				}else if(data.hits.hits.length){
					tosave.date = Date.now();
					tosave.deleted = 'no';

					//delete the old album release and save the new one
					var bulk = [
						{delete:{_index:db_index,_type:'album',_id:data.hits.hits[0]._id}},
						{index:{_index:db_index,_type:'album',_id:tosave.id}},
						tosave,
					];

					//update all the old tracks to the new album release
					elastic.client.search({
						index:db_index,
						type:['local','internetarchive'],
						size:1000,
						body:{query:{bool:{must:[
							{match:{'album':data.hits.hits[0]._id}}
						]}}}
					}).then(function(data2){
						data2.hits.hits.forEach(function(hit){
							bulk.push({update:{_index:db_index,_type:hit._source.type,_id:hit._id}});
							bulk.push({doc:{album:tosave.id}});
						})
						elastic.client.bulk({body:bulk,refresh:true},function(err,data){
							busy = false;
							mbz.pacer();
							if(err){
								console.Yolk.error(err);
							}else{
								meta.add(artwork);
							}
						})
					},function(err){
						console.Yolk.error(err);
					})
				}else{
					save();
				}
			})

		break;
	}

	//save the album to the database
	function save(){
		tosave.date = Date.now();
		tosave.deleted = 'no';

		var create = {
			index:db_index,
			type:type,
			id:body.id,
			refresh:true,
			body:tosave
		}
		elastic.client.create(create,function(err,data){
			busy = false;
			mbz.pacer();
			if(err){
				console.Yolk.error(err);
			}else{

				message.send('refresh',type);
				meta.add(artwork)
			}
		})
	}
}
var saveTrack = function(track,release){
	var self = mbz;
	if(kill){
		return;
	}
	if(release){
		track.metadata.artist = release.recording.artist.name;
		track.artist = release.recording.artist.id;
		track.musicbrainzed = 'yes';
		track.musicbrainz_id = release.recording.id.toString();
		track.date = Date.now();
		if(track.type !== 'youtube'){
			track.metadata.album = release.album;
			track.album = release.id
		}
	}

	if(track.type === 'internetarchive'){
		elastic.update({
			index:db_index,
			type:'internetarchivesearch',
			id:track.id,
			body:{doc:{
				musicbrainzed:'yes'
			}}
		},function(data){
			busy = false;
			self.pacer();
		},function(err){
			busy = false;
			self.pacer();
			console.Yolk.error(err);
		})
	}

	if(track.type === 'local'){
		elastic.update({
			index:db_index,
			type:track.type,
			id:track.id,
			body:{doc:track}
		}).then(function(data){
			busy = false;
			self.pacer();
			message.send('refresh',track.type);
		},function(err){
			busy = false;
			self.pacer();
			console.Yolk.error(err);
		})
	}else{
		elastic.client.create({
			index:db_index,
			type:track.type,
			id:track.id,
			body:track
		},function(err,data){
			if(err){
				busy = false;
				self.pacer();
				console.Yolk.error(err);
			}else{
				busy = false;
				self.pacer();
				message.send('refresh',track.type);
			}
		})
	}
}
var doRelease = function(Recording,release){

	if(release.media && release.media[0] && release.media[0].format){
		var format = release.media[0].format.toLowerCase();
	}else{
		var format = 'unknown'
	}

	if(!release['release-group']){
		var type = 'unknown';
		var type2 = 'unkown';
	}else{
		if(!release['release-group']['primary-type']){
			var type = 'unknown'
		}else{
			var type = release['release-group']['primary-type'].toLowerCase();
		}
		if(!release['release-group']['secondary-types'] || !release['release-group']['secondary-types'].length){
			if(tools.strim(release['artist-credit'][0].artist.name)==='various artists'){
				var type2 = 'compilation';
			}else if(release['artist-credit'][0].artist.name === 'unknown-credit'){
				if(release.status){
					release.status = release.status.toLowerCase();
				}
				if(release.status === 'official' && type === 'album'){
					var type2 = 'lp'
				}else{
					var type2 = 'unknown';
				}
			}else{
				var type2 = 'lp'
			}

		}else{
			var type2 = release['release-group']['secondary-types'][0].toLowerCase();
		}
	}
	var Release = {
		recording:Recording,
		id:release.id,
		country:release.country,
		date:release.date ? Number(new Date(release.date)):0,
		format:format,
		album:fix(release.title),
		artist:release['artist-credit'][0].artist.name,
		status:release.status ? release.status.toLowerCase():'unknown',
		type:type,
		type2:type2
	};

	return Release;
}
//submit query to musicbrainz server
musicbrainz.prototype.submit = function(track){
	var self = this;
	track.deleted = 'no';

	if(track.type!=='album' && track.type!=='artist'){
		this.fromAlbum(track).then(function(){
			busy = true;
			new go(track,self);
		},function(err){
			finish();
		})
	}else{
		if(track.type !== 'artist' && track.type !== 'youtube'){
			busy = true;
		}
		new go(track,self);
	}

	//submit item to Musicbrainz server
	function go(track2,self){
		var options={};
		options.headers = headers;
		options.url = track2.query;
		request.get(options,function(error, response, body){

			if(kill){return;}
			if (!error && response.statusCode == 200) {
				try{
					var tt = JSON.parse(body);
				}
				catch(err){
					var tt=false;
					console.Yolk.error(err);
				}

				if(!tt){
					busy = false;
					self.pacer();
					return;
				}

				//save and return if album or artist lookup
				if(track.type === 'artist'||track.type === 'album'){
					saveMeta(track.type,tt);
					finish();
					return;
				}

				//Parse the track to find the best release candidate
				var releases = [];

				//track already has a musicbrainz id, thus recording is known
				if(track2.musicbrainz_id){
					if(!tt.releases){
						busy = false;
						self.pacer();
						return;
					}
					var Recording={};
					Recording.title = fix(tt.title);
					Recording.id = tt.id;
					if(tt.disambiguation){
						Recording.disambig = fix(tt.disambiguation);
					}
					if(tt['artist-credit'] && tt['artist-credit'][0] && tt['artist-credit'][0].artist){
						Recording.artist = {
							name:fix(tt['artist-credit'][0].artist.name),
							id:tt['artist-credit'][0].artist.id
						};
					}
					if(tt.tags){
						Recording.tags = tt.tags;
					}
					//push all found release into array for bulk query
					tt.releases.forEach(function(release){
						if(!release['artist-credit']){
							release['artist-credit']=[{artist:{name:'unknown-credit'}}];
						}
						//Process release into formatted object
						var Release = doRelease(Recording,release)
						releases.push({index:{_index:db_index,_type:'release',_id:Release.id}})
						releases.push(Release);
					})
				//No musicbrainz ID, so first find the best recording candidate
				}else{
					if(!tt.recordings){
						busy = false;
						self.pacer();
						return;
					}

					//prepare the incoming track title for classical analysis
					var title1 = tools.strim(track2.metadata.title);
					var op1=tools.divider(title1);
					var composers = {};
					if(title1.indexOf(' bwv ')>-1){
						composers.bwv=['false','false'];
						var bwv = title1.split(' bwv ')[1].split(' ')[0];
						if(Number(bwv)>0){
							composers.bwv[0] = Number(bwv)
						}
					}

					tt.recordings.forEach(function(recording){

						if(!recording.releases || !recording.title){
							return;
						}


						var title2 = tools.strim(fix(recording.title))
						//reject if the recording does not match the submitted track
						if(title1.indexOf(title2) === -1 && title2.indexOf(title1) === -1){
							var foo = title1.split(' ');
							if(Number(foo[0]) > 0){
								foo.shift()
								title1 = foo.join(' ');
							}
						}
						if(title1.indexOf(title2) === -1 && title2.indexOf(title1) === -1){
							if(!tools.classical(title1,title2,op1,composers)){
								return;
							}else{
								console.Yolk.say(track2.metadata.album+' || '+title1+' || '+title2)
								track2.classical = true;
							}
						}

						/*
						if(title1 !== title2){
							return;
						}
						*/
						var Recording={};
						Recording.title = fix(recording.title);
						Recording.id = recording.id;
						if(recording.disambiguation){
							Recording.disambig = fix(recording.disambiguation);
						}
						if(recording['artist-credit'] && recording['artist-credit'][0] && recording['artist-credit'][0].artist){
							Recording.artist = {
								name:fix(recording['artist-credit'][0].artist.name),
								id:recording['artist-credit'][0].artist.id
							};
						}
						if(recording.tags){
							Recording.tags = recording.tags;
						}
						//push all found release into array for bulk query
						recording.releases.forEach(function(release){
							//console.Yolk.say(release.title);
							if(!release['artist-credit']){
								release['artist-credit']=[{artist:{name:'unknown-credit'}}];
							}
							//Process release into formatted object
							var Release = doRelease(Recording,release);
							releases.push({update:{_index:db_index,_type:'release',_id:Release.id}})
							releases.push({doc:Release,doc_as_upsert:true});

						})
					})
				}

				//return if no releases were found for track
				if(!releases.length){
					console.Yolk.error('No releases found for '+track2.metadata.artist+': '+track2.metadata.album+': '+track2.metadata.title);
					console.Yolk.say(track2.query);
					console.Yolk.say(title1);
					console.Yolk.say(op1);
					console.Yolk.say('--------------------------------------------------------------------------------------------------------------');
					if(!track2.norelease){
						track2.norelease = 1;
					}else{
						track2.norelease++
					}
					mbq.other.push(track2);
					busy = false;
					self.pacer();
					return
				}
				//First save the found releases to database
				elastic.client.bulk({body:releases,refresh:'true'},function(err,data){
					if(err){
						busy = false;
						self.pacer();
						console.Yolk.error(err)
					}else{
						//then query the releases for best candidate
						var must = [];

						var functions = [
							{filter:{match:{type:{query:'album'}}},weight:50},
							{filter:{match:{status:{query:'official'}}},weight:50},
							{filter:{match:{type2:{query:'lp'}}},weight:60},
							{filter:{match:{type2:{query:'single'}}},weight:40},
							{filter:{match:{type2:{query:'soundtrack'}}},weight:30},
							{filter:{match:{type2:{query:'compilation'}}},weight:30},
							{filter:{match:{type2:{query:'live'}}},weight:20},
							{filter:{match:{format:{query:'vinyl'}}},weight:50},
							{filter:{match:{format:{query:'cd'}}},weight:40},
							{filter:{match:{country:{query:'GB'}}},weight:2},
							{filter:{match:{country:{query:'US'}}},weight:2},
							{filter:{match:{country:{query:preferred_release}}},weight:2}
						];

						if(track2.metadata.artist){
							if(!track2.classical){
								must.push({match:{'recording.artist.name':{query:track2.metadata.artist,fuzziness:'auto',operator:'and'}}});
							}
							functions.push({filter:{match:{artist:{query:track2.metadata.artist,fuzziness:'auto'}}},weight:20});
						}
						if(track2.metadata.title){
							must.push({match:{'recording.title':{query:track2.metadata.title,fuzziness:'auto'}}});
							functions.push({filter:{match:{'recording.title':{query:track2.metadata.title,operator:'and'}}},weight:200})
							functions.push({filter:{match:{disambig:{query:track2.metadata.title,operator:'and'}}},weight:20})
						}
						if(track2.metadata.album && track2.metadata.album !=='youtube'){
							functions.push({filter:{term:{'album.raw':track2.metadata.album}},weight:100});
							functions.push({filter:{match:{album:{query:track2.metadata.album,operator:'and'}}},weight:40});
							functions.push({filter:{match:{album:{query:track2.metadata.album}}},weight:20});
							functions.push({filter:{match:{disambig:{query:track2.metadata.album,operator:'and'}}},weight:20});
						}

						elastic.client.search({
							index:db_index,
							type:'release',
							size:1000,
							body:{query:{
								function_score:{
									query:{constant_score:{filter:{bool:{must:must}}}},
									functions:functions,
									score_mode:'sum',
									boost_mode:'sum'
								}
							}}
						},function(err,data){
							if(err){
								busy = false;
								self.pacer();
								console.Yolk.error(err);
							}else if(data.hits.hits.length){
								console.Yolk.say(data)
								console.Yolk.warn(track2.metadata.artist+' : '+track2.metadata.album+' : '+track2.metadata.title);
								console.Yolk.say(tt.recordings)
								console.Yolk.say(data.hits.hits)

								//filter result to maximum scores only
								var maxscore;
								data.hits.hits.forEach(function(hit){
									if(!maxscore){
										maxscore = hit._score
									}else if(hit._score > maxscore){
										maxscore = hit.score
									}
								})

								var result = data.hits.hits.filter(function(hit){
									if(hit._score === maxscore){
										return true;
									}
								})

								//sort the result by album release date, oldest first
								result.sort(function(a,b){
									if (a._source.date < b._source.date){
										return 1;
									}
									if (a._source.date > b._source.date){
										return -1;
									}
									return 0;
								})

								console.Yolk.say(result)

								var release = result[0]['_source'];
								saveTrack(track2,release);
								if(track2.type !== 'youtube'){
									var album = {
										type:'album',
										id:release.id
									}
									self.add(album);
								}
								var artist = {
									type:'artist',
									id:release.recording.artist.id
								}
								self.add(artist);
							}else{
								busy = false;
								self.pacer();
							}
						})
					}
				})

			}else{
				if(response){

					response = response.toJSON();
					if((response.statusCode === 503 || response.statusCode === 500) && !kill){
						if(!track2.resub){
							track2.resub = 1;
						}else{
							track2.resub++;
						}
						if(track2.type === 'album'){
							mbq.album.unshift(track2);
						}else{
							mbq.other.unshift(track2);
						}
					}
				}
				if(error){
					console.Yolk.error(error);
				}
				busy = false;
				self.pacer();
			}
			finish();
		})
	}

	function finish(){
		message.send('progress',{
			type:'musicbrainz',
			context:track.type,
			size:mbq.other.length+mbq.album.length
		});
	}
}

//limit the submission rate to musicbrainz server to sane

musicbrainz.prototype.pacer=function(bounce){
	//console.Yolk.say('bounce:'+bounce+' busy:'+busy+' timeout:'+(this.timeout ? true:false)+' albums: '+mbq.album.length+' other:'+mbq.other.length);
	var self = this;
	if(bounce || busy){
		clearTimeout(this.timeout);
		this.timeout = false;
		if(busy){
			this.timeout = setTimeout(function(){
				self.timeout = false;
				self.pacer();
			},self.pace);
		}
	}
	if(this.timeout){
		return;
	}
	if(mbq.album.length+mbq.other.length){
		if(mbq.album.length){
			var track = mbq.album.shift();
		}else{
			var track = mbq.other.shift();
		}

		self.submit(track);
		this.timeout = setTimeout(function(){
			self.timeout = false;
			self.pacer();
		},self.pace);
	}else{
		this.timeout = false;
	}
}

//attempt to find track details from an existing album
musicbrainz.prototype.fromAlbum = function(track){

	var self = this;
	return new q(function(resolve,reject){
		if(kill){
			reject();
			return;
		}

		var body = {
			index:db_index,
			type:'album',
			body:{query:{
				function_score:{
					query:{constant_score:{filter:{nested:{path:'tracks',score_mode : "none",query:{bool:{must:[
						{match:{'tracks.title':{query:track.metadata.title}}},
						{match:{'tracks.artist.name':{query:track.metadata.artist}}},
					]}}}}}},
					functions:[
						{filter:{match:{primary_type:{query:'album'}}},weight:5},
						{filter:{match:{secondary_type:{query:'lp'}}},weight:10},
						{filter:{match:{secondary_type:{query:'single'}}},weight:4},
						{filter:{match:{secondary_type:{query:'soundtrack'}}},weight:3},
						{filter:{match:{secondary_type:{query:'compilation'}}},weight:3},
						{filter:{match:{secondary_type:{query:'live'}}},weight:2},
						{filter:{nested:{path:'tracks',score_mode:'none',query:{
							match:{'tracks.title.exact':{query:track.metadata.title,operator:'and'}}
						}}},weight:100},

						//{filter:{multi_match:{fields:['tracks.title.exact'],query:track.metadata.title,operator:'and'}},weight:100},
						//{filter:{multi_match:{fields:['tracks.title'],query:track.metadata.title,fuzziness:'auto',operator:'and'}},weight:50}
					],
					score_mode:'sum',
					boost_mode:'sum'
				}
			}}
		}
		if(track.metadata.album && track.type !== 'youtube'){
			body.body.query.function_score.functions.push({filter:{match:{'metadata.title':{query:track.metadata.album,operator:'and'}}},weight:100})
		}

		elastic.client.search(body,function(err,data){
			if(err){
				console.Yolk.error(err);
				resolve();
				return;
			}

			if(data.hits.hits.length){


				//console.Yolk.warn(track.metadata.artist+' : '+track.metadata.album+' : '+track.metadata.title);
				//console.Yolk.say(data.hits.hits)


				var tracks = data.hits.hits[0]._source.tracks

				var thistrack = false;
				var artist2=tools.strim(track.metadata.artist);
				var title2=tools.strim(track.metadata.title);
				var exact = false;
				tracks.forEach(function(track2){
					var artist1=tools.strim(track2.artist.name);
					var title1=tools.strim(track2.title);
					if((artist1.indexOf(artist2) > -1||artist2.indexOf(artist1) > -1)&&(title2 === title1)){
						exact = true;
					}
				})
				tracks.forEach(function(track2){
					var artist1=tools.strim(track2.artist.name)
					var title1=tools.strim(track2.title)

					if(track.norelease && track.norelease > 1){
						self.pacer(true);
						reject()
					}
					if(!exact || track.norelease === 1){
						var condition = (
							(artist1.indexOf(artist2) > -1||artist2.indexOf(artist1) > -1)&&
							(title1.indexOf(title2) > -1||title2.indexOf(title1) > -1)
						);

					}else{
						var condition = (
							(artist1.indexOf(artist2) > -1||artist2.indexOf(artist1) > -1)&&
							(title2 === title1)
						)
					}

					if(condition){
						track.filter={};
						track.deleted = 'no';
						if(track.type!=='youtube'){
							track.metadata.album = fix(data.hits.hits[0]._source.metadata.title);
							track.album=data.hits.hits[0]._source.id;
						}
						track.metadata.title = fix(track2.title);
						track.metadata.artist = fix(track2.artist.name);
						track.date = Date.now();
						track.musicbrainzed ='yes',
						track.musicbrainz_id = track2.id.toString();
						track.artist=track2.artist.id.toString(),

						thistrack = track
					}
				})
				if(thistrack){
					saveTrack(thistrack);
					self.add({
						type:'artist',
						id:thistrack.artist
					})
					self.pacer(true);
					reject();
				}else{
					resolve();
				}
			}else{

				if(track.norelease){
					track.deleted = 'yes';
					saveTrack(track);
					self.pacer(true);
					reject()
				}
				resolve();
			}
		})
	})
}

var dupes = {};
musicbrainz.prototype.dupe = function(track){
	var self = this;
	return new q(function(resolve,reject){
		if(!dupes[track.type]){
			dupes[track.type] = []
		}
		if(dupes[track.type].indexOf(track.id) > -1){
			reject();
		}else{
			dupes[track.type].push(track.id);
			elastic.client.get({
				index:db_index,
				type:track.type,
				id:track.id
			},function(err,data){

				if(data.found){
					if(track.type === 'album' || track.type === 'artist'){
						reject();
					}else if(data['_source'] && data['_source'].musicbrainzed && data['_source'].musicbrainzed === 'yes'){
						reject()
					}else{
						resolve();
					}
				}else{
					resolve();
				}
			});
		}
	})
}
musicbrainz.prototype.add = function(track){
	var self = this;

	//strip out the "’" quotations which confuse the hell out of elasticsearch
	if(track.metadata){
		Object.keys(track.metadata).forEach(function(key){
			track.metadata[key] = fix(track.metadata[key]);
		});
	}
	this.dupe(track).then(function(){
		//construct the musicbrainz query string
		if(track.type === 'album'){
			track.query = mb_url+'release/'+track.id+'?fmt=json&inc=release-groups+recordings+url-rels+artists+artist-credits';
		}else if(track.type === 'artist'){
			track.query = mb_url+'artist/'+track.id+'?fmt=json&inc=url-rels';
		}else if(!track.musicbrainz_id){
			track.query = mb_url+'recording/'+tools.musicbrainz(track.type,track)+'&inc=recording-rels&fmt=json';
		}else{
			track.query = mb_url+'recording/'+track.musicbrainz_id+'?'+'&inc=recording-rels&fmt=json';
		}
		if(track.type==='album'){
			mbq.album.unshift(track);
		}else if(track.type==='youtube'){
			mbq.youtube.push(track);
		}else{
			if(track.type === 'artist'){
				mbq.other.push(track);
			}else{
				mbq.other.unshift(track);
			}
		}
		self.pacer()
	},function(){
		self.pacer()
	})
}
if(!mbz){
	var mbz = new musicbrainz();
}
module.exports = mbz;

//listen for incoming data
ipcMain.on('musicbrainz', function(event, track) {
	mbz.add(track);
})
ipcMain.on('kill', function(event,data) {

	if(data === 'revive'){
		kill = false;
		busy = false;
		dupes = {};
		mbz.pacer();
		return;
	}
	kill = true;
	clearTimeout(mbz.timeout);
	mbz.timeout = false;
	delete mbq.album;
	delete mbq.other;
	mbq.album = [];
	mbq.other = [];
	mbq.youtube = [];

})

function fix(string){
	return string.trim().replace(/\’/g,"'").toLowerCase();
}
