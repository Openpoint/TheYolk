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
const mbtools = require('../tools/musicbrainztools.js');
const db_index = process.Yolk.modules.musicPlayer.config.db_index.index;
const mb_url="https://musicbrainz.org/ws/2/";
const message = process.Yolk.message;
const elastic = process.Yolk.db
const headers = process.Yolk.modules["musicPlayer"].config.headers;

const mbq={
	album:[],
	youtube:[],
	other:[],
	fix:[]
};
var kill = false;
var busy = false;

var musicbrainz = function(){
	this.pace = 1000; //set the speed limit for MusicBrainz API calls
}


var saveTrack = function(track){
	var self = mbz;
	if(kill){
		return;
	}
	if(track.type === 'internetarchive'){
		elastic.update({index:db_index,type:'internetarchivesearch',id:track.id,body:{doc:{musicbrainzed:'yes'}}}).then(function(data){},function(err){
			console.Yolk.error(err);
		})
	}
	if(track.type === 'local'){
		elastic.update({index:db_index,type:track.type,id:track.id,body:{doc:track}}).then(function(data){
			busy = false;
			message.send('refresh',track.type);
		},function(err){
			busy = false;
			console.Yolk.error(err);
		})
	}else{
		elastic.client.create({index:db_index,type:track.type,id:track.id,body:track},function(err,data){
			if(err){
				busy = false;
				console.Yolk.error(err);
			}else{
				busy = false;
				message.send('refresh',track.type);
			}
		})
	}
}

//submit a query to musicbrainz server
musicbrainz.prototype.submit = function(track){
	var self = this;
	track.deleted = 'no';
	if(track.fix){ //skip the initial track to album match in favour of getting reliable metadata from the musicbrainz id
		track.toalbum=1;
		console.Yolk.say('FIX ----------------------------- '+track.metadata.artist+' : '+track.metadata.album+' : '+track.metadata.title+' | '+track.musicbrainz_id);
		new go(track,self);
		busy = false;
	}else if(track.type!=='album' && track.type!=='artist'){
		this.fromAlbum(track).then(function(message){ //first try to match the track to an existing album
			if(!track.toalbum){ //this is the tracks first pass, so try to find an album for it
				track.toalbum=1;
				busy = true;
				console.Yolk.say(track.type.toUpperCase()+' -------------------------- '+track.metadata.artist+' : '+track.metadata.album+' : '+track.metadata.title+' | '+track.musicbrainz_id);
				new go(track,self);
			}else{ //this is the tracks second pass and no album was found, so mark it as deleted
				track.deleted = 'yes';
				track.deleted_reason = message;
				console.Yolk.say(message.toUpperCase()+' -------------------------- '+track.metadata.artist+' : '+track.metadata.album+' : '+track.metadata.title+' | '+track.musicbrainz_id);
				console.Yolk.log(track);
				saveTrack(track);
			}
		},function(){ //track was successfully matched to an album
			console.Yolk.say('FROM ALBUM --------------------- '+track.metadata.artist+' : '+track.metadata.album+' : '+track.metadata.title)
			busy = false;
			self.pacer(true);
		})
	}else{
		if(track.type === 'album') busy = true;
		console.Yolk.say(track.type.toUpperCase()+' -------------------------- '+track.title+' | '+track.id);
		new go(track,self);
	}

	//submit item to Musicbrainz server
	function go(track,self){
		var options={
			headers:headers,
			url:track.query
		};
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
					return;
				}
				if(track.fix){
					track.metadata.artist = tools.fix(tt['artist-credit'][0].artist.name);
					track.metadata.title = tools.fix(tt.title);
					if(tt.length){
						track.duration = Number(tt.length)
					}else{
						track.duration = 0;
					}
				}
				//save and return if album or artist lookup
				if(track.type === 'artist'||track.type === 'album'){
					mbtools.saveMeta(track.type,tt).then(function(message){
						console.Yolk.say(message);
						busy = false;
					});
					return;
				}
				var releases = [];
				//got from a query search
				if(tt.recordings && tt.recordings.length){
					tt.recordings.forEach(function(recording){
						if(recording.releases && recording.releases.length){
							var batch = mbtools.doRelease(recording);
							if(batch) releases = releases.concat(batch);
						}
					})
				//got from a mbid lookup
				}else if(tt.releases && tt.releases.length){
					tt.releases.forEach(function(release){
						release.media[0].track = release.media[0].tracks
					})
					var batch = mbtools.doRelease(tt);
					if(batch) releases = releases.concat(batch);
				}

				//return if no releases were found for track
				if(!releases.length){
					console.Yolk.error('No releases found for '+track.metadata.artist+': '+track.metadata.album+': '+track.metadata.title);
					track.deleted = 'yes'
					track.deleted_reason = 'no releases found for track';
					saveTrack(track);
					busy = false;
					return
				}
				//First save the found releases to database
				elastic.client.bulk({body:releases,refresh:true},function(err,data){
					if(err){
						console.Yolk.error(err);
						new go(track,self);
					}else{
						//then query the releases for best candidate
						var structure = {
							query1:[
								tools.wrap.constant_score({match:{'tracks.title.exact':{query:track.metadata.title}}},{boost:10}),
								tools.wrap.constant_score({match:{'tracks.title2.exact':{query:track.metadata.title}}},{boost:10})
							],
							query2:[],
							query3:[],
							filters:[
								tools.wrap.filter({match:{"type.exact":{query:'album',type:'phrase'}}},{weight:5}),
								tools.wrap.filter({match:{"status.exact":{query:'official',type:'phrase'}}},{weight:5}),
								tools.wrap.filter({match:{"type2.exact":{query:'lp'}}},{weight:10}),
								tools.wrap.filter({match:{"type2.exact":{query:'single',type:'phrase'}}},{weight:2}),
								tools.wrap.filter({match:{"type2.exact":{query:'soundtrack',type:'phrase'}}},{weight:3}),
								tools.wrap.filter({match:{"type2.exact":{query:'compilation',type:'phrase'}}},{weight:3}),
								tools.wrap.filter({match:{"type2.exact":{query:'live',type:'phrase'}}},{weight:2}),
								tools.wrap.filter({match:{format:{query:'vinyl',fuzziness:'auto'}}},{weight:8}),
								tools.wrap.filter({match:{format:{query:'cd',type:'phrase'}}},{weight:4}),
							]
						}
						var postfix = tools.postfix(track.metadata.title);
						if(postfix){
							['tracks.title','tracks.title2'].forEach(function(add){
								var match = {};
								match[add]={query:postfix.prefix,type:'phrase'}
								structure.query1.push(tools.wrap.constant_score({match:match}));
								var match2 = {};
								match2[add]={query:postfix.postfix,type:'phrase',slop:2}
								structure.query2.push(tools.wrap.constant_score({match:match2},{boost:20}))
							})
						}else{
							['tracks.title','tracks.title2'].forEach(function(add){
								var match = {};
								match[add] = {query:track.metadata.title,minimum_should_match:2};
								structure.query1.push(tools.wrap.constant_score({match:match}))
							})
						}
						if(track.metadata.artist && !track.classical){
							structure.query2.push(
								tools.wrap.constant_score({match:{'tracks.artist.name':{query:track.metadata.artist,fuzziness:'auto',minimum_should_match:1}}},{boost:100})
							)
						}
						if(track.metadata.album && track.metadata.album !=='youtube'){
							var foo = tools.wrap.bool([{should:[
								{match:{'tracks.title':{query:track.metadata.title,minimum_should_match:1}}},
								{match:{'tracks.title2':{query:track.metadata.title,minimum_should_match:1}}}
							]}]);
							foo = tools.wrap.nested('tracks',foo)
							postfix = tools.postfix(track.metadata.album);

							if(postfix){
								foo = tools.wrap.bool([{must:[{match:{'album':{query:postfix.prefix,type:'phrase'}}},foo]}]);
								structure.filters.push(tools.wrap.filter({match:{'album':{query:postfix.postfix,minimum_should_match:2}}},{weight:10}));
								var nested = tools.wrap.nested('tracks',{match:{"tracks.disambig":{query:postfix.postfix,minimum_should_match:1}}});
								structure.filters.push(tools.wrap.filter(nested,{weight:10}));
							}else{
								foo = tools.wrap.bool([{must:[{match:{'album':{query:track.metadata.album,type:'phrase',slop:2}}},foo]}]);
							}
							foo = tools.wrap.filter(foo,{weight:100});
							structure.filters.push(foo);
						}
						if(track.musicbrainz_id){
							structure.query3.push(tools.wrap.constant_score({match:{'tracks.id.exact':{query:track.musicbrainz_id,type:'phrase'}}},{boost:100}));
						}
						if(track.duration && !track.musicbrainz_id){
							var range = tools.wrap.constant_score({range:{'tracks.length':{
								gte:Math.floor(track.duration/1000)*1000,
								lte:(Math.floor(track.duration/1000)+1)*1000
							}}},{boost:100});
							var zero = tools.wrap.constant_score({term:{'tracks.length':0}});
							var duration = tools.wrap.bool([{should:[range,zero]}]);
							structure.query3.push(duration);
						}

						if(structure.query2.length){
							structure.query1 = [tools.wrap.bool([{should:structure.query1}]),tools.wrap.bool([{should:structure.query2}])].concat(structure.query3);
							structure.query1 = tools.wrap.bool([{must:structure.query1}]);
						}else{
							if(structure.query3.length){
								structure.query1 = [tools.wrap.bool([{should:structure.query1}])].concat(structure.query3);
								structure.query1 = tools.wrap.bool([{must:structure.query1}]);
							}else{
								structure.query1 = tools.wrap.bool([{should:structure.query1}]);
							}
						}

						structure.query1 = [
							tools.wrap.nested('tracks',structure.query1,{inner_hits:{}})
						];
						structure.query = tools.wrap.bool([{must:structure.query1}]);
						var fs = tools.wrap.function_score({score_mode:'sum',boost_mode:'multiply'});
						fs = tools.wrap.function_score_add(fs,structure.filters);
						fs = tools.wrap.function_score_add(fs,structure.query);
						var body = {index:db_index,type:'release',size:10,body:{query:fs}};

						elastic.client.search(body,function(err,data){
							if(err){
								console.Yolk.error(err);
								//console.Yolk.warn(JSON.stringify(body,false,2))
								busy = false;
								return;
							}
							if(data.hits.hits.length && data.hits.hits[0].inner_hits.tracks.hits.hits.length && data.hits.hits[0]._score > 1000){

								var newtitle = tools.fix(data.hits.hits[0].inner_hits.tracks.hits.hits[0]._source.title);
								var newartist = tools.fix(data.hits.hits[0].inner_hits.tracks.hits.hits[0]._source.artist.name);
								var newalbum = tools.fix(data.hits.hits[0]._source.album);

								if(track.metadata.title!==newtitle){
									track.metadata.old_title = track.metadata.title;
									track.metadata.title = newtitle;
								}
								if(track.metadata.artist!==newartist){
									track.metadata.old_artist = track.metadata.artist;
									track.metadata.artist = newartist;
								}
								if(track.metadata.album!==newalbum){
									track.metadata.old_album = track.metadata.album;
									track.metadata.album = newalbum;
								}
								var album = {
									type:'album',
									id:data.hits.hits[0]._source.id,
									title:track.metadata.album
								}
								track.album = album.id;
								track.musicbrainz_id = data.hits.hits[0].inner_hits.tracks.hits.hits[0]._source.id;
								track.fix = false;
								self.add(album,track);
								busy = false;
							}else{
								if(data.hits.hits.length){
									var message = 'NO RELEASES | '+data.hits.hits[0]._score+' | '+track.metadata.artist+' : '+track.metadata.album+' : '+track.metadata.title+' | '+track.musicbrainz_id;
								}else{
									var message = 'NO RELEASES | '+track.metadata.artist+' : '+track.metadata.album+' : '+track.metadata.title+' | '+track.musicbrainz_id;
								}
								console.Yolk.say(message);
								busy = false;
							}
						})
					}
				})
				return;

			}else{
				var types = {youtube:'youtube',artist:'other',local:'other',internetarchive:'other',album:'album'};
				if(response){
					response = response.toJSON();
					if((response.statusCode === 503 || response.statusCode === 500) && !kill){
						//console.Yolk.warn(response.statusCode)
						if(track.toalbum){track.toalbum--}
						if(track.fix){
							mbq.fix.unshift(track);
						}else{
							mbq[types[track.type]].unshift(track);
						}
					}
				}
				if(error){
					//console.Yolk.error(error);
					if(track.fix){
						mbq.fix.push(track);
					}else{
						mbq[types[track.type]].push(track);
					}
				}
				busy = false;
			}
		})
	}
}

//limit the submission rate to musicbrainz server to sane
musicbrainz.prototype.pacer=function(bounce){
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
	console.Yolk.say('*************************************************************************************************************************************** album: '+mbq.album.length+' | fix: '+mbq.fix.length+' | other:'+mbq.other.length);

	message.send('progress',{
		type:'musicbrainz',
		//context:track.type,
		size:mbq.other.length+(mbq.album.length*2)+(mbq.fix.length*2)
	});

	if(mbq.album.length+mbq.other.length+mbq.fix.length){
		if(mbq.fix.length){
			var track = mbq.fix.shift();
		}else if(mbq.album.length){
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

	//track.musicbrainz_id = 'bec8765f-777e-474a-bf19-e39d7b3b41a1';

	var self = this;
	return new q(function(resolve,reject){
		if(kill){
			reject();
			return;
		}
		var artist;
		track.classical && track.classical.composer ? artist=track.classical.composer : artist = track.metadata.artist;
		if(!track.musicbrainz_id && (!track.metadata.title || (!track.metadata.artist && !track.metadata.album))){
			resolve();
		}
		var should2 = [
			tools.wrap.constant_score({match:{'tracks.title.exact':{query:track.metadata.title}}},{boost:10}),
			tools.wrap.constant_score({match:{'tracks.title2.exact':{query:track.metadata.title}}},{boost:10})
		]
		var structure = {
			query1:[
				tools.wrap.bool([{should:should2}]),
			],
			query2:[],
			query3:[],
			filters:[
				tools.wrap.filter({match:{primary_type:{query:'album'}}},{weight:5}),
				tools.wrap.filter({match:{secondary_type:{query:'lp'}}},{weight:10}),
				tools.wrap.filter({match:{secondary_type:{query:'single'}}},{weight:4}),
				tools.wrap.filter({match:{secondary_type:{query:'compilation'}}},{weight:3}),
				tools.wrap.filter({match:{secondary_type:{query:'live'}}},{weight:2}),

				tools.wrap.filter(tools.wrap.nested('tracks',tools.wrap.bool([{should:[
					{match:{'tracks.title.exact':{query:track.metadata.title}}},
					{match:{'tracks.title2.exact':{query:track.metadata.title}}},
				]}])),{weight:100}),
				tools.wrap.filter(tools.wrap.nested('tracks',tools.wrap.bool([{should:[
					{match:{'tracks.title':{query:track.metadata.title,operator:'and'}}},
					{match:{'tracks.title2':{query:track.metadata.title,operator:'and'}}}
				]}])),{weight:90}),
				tools.wrap.filter(tools.wrap.nested('tracks',tools.wrap.bool([{should:[
					{match:{'tracks.title':{query:track.metadata.title}}},
					{match:{'tracks.title2':{query:track.metadata.title}}}
				]}])),{weight:80}),
			]
		}
		var postfix = tools.postfix(track.metadata.title);
		if(postfix){
			['tracks.title','tracks.title2'].forEach(function(add){
				var match = {};
				match[add]={query:postfix.prefix,type:'phrase'}
				structure.query1.push(tools.wrap.constant_score({match:match}));
				var match2 = {};
				match2[add]={query:postfix.postfix,type:'phrase',slop:2}
				structure.query2.push(tools.wrap.constant_score({match:match2},{boost:20}))
			})
		}else{
			['tracks.title','tracks.title2'].forEach(function(add){
				var match = {};
				match[add] = {query:track.metadata.title,minimum_should_match:2};
				structure.query1.push(tools.wrap.constant_score({match:match}))
			})
		}
		if(track.metadata.artist){
			structure.query2.push(
				tools.wrap.bool([{should:[
					tools.wrap.constant_score({match:{'tracks.artist.name':{query:artist,fuzziness:'auto',minimum_should_match:1}}},{boost:100}),
					tools.wrap.nested('tracks.artists',tools.wrap.constant_score({match:{'tracks.artists.name':{query:artist,fuzziness:'auto',minimum_should_match:1}}},{boost:100}))
				]}])
			)
		}
		if(track.metadata.album && track.metadata.album !=='youtube'){
			var foo = tools.wrap.bool([{should:[
				{match:{'tracks.title':{query:track.metadata.title,minimum_should_match:1}}},
				{match:{'tracks.title2':{query:track.metadata.title,minimum_should_match:1}}}
			]}]);
			foo = tools.wrap.nested('tracks',foo)
			postfix = tools.postfix(track.metadata.album);

			if(postfix){
				foo = tools.wrap.bool([{must:[{match:{'album':{query:postfix.prefix,type:'phrase'}}},foo]}]);
				structure.filters.push(tools.wrap.filter({match:{'album':{query:postfix.postfix,minimum_should_match:2}}},{weight:10}));
				var nested = tools.wrap.nested('tracks',{match:{"tracks.disambig":{query:postfix.postfix,minimum_should_match:1}}});
				structure.filters.push(tools.wrap.filter(nested,{weight:10}));
			}else{
				foo = tools.wrap.bool([{must:[{match:{'album':{query:track.metadata.album,type:'phrase',slop:2}}},foo]}]);
			}
			foo = tools.wrap.filter(foo,{weight:100});
			structure.filters.push(foo);
		}
		if(track.musicbrainz_id){
			structure.query3.push(tools.wrap.constant_score({match:{'tracks.id.exact':{query:track.musicbrainz_id,type:'phrase'}}},{boost:100}))
		}
		if(track.duration && !track.musicbrainz_id){
			var range = tools.wrap.constant_score({range:{'tracks.length':{
				gte:Math.floor(track.duration/1000)*1000,
				lte:(Math.floor(track.duration/1000)+1)*1000
			}}},{boost:100});
			var zero = tools.wrap.constant_score({term:{'tracks.length':0}});
			var duration = tools.wrap.bool([{should:[range,zero]}]);
			structure.query3.push(duration);
		}

		if(structure.query2.length){
			structure.query1 = [tools.wrap.bool([{should:structure.query1}]),tools.wrap.bool([{should:structure.query2}])].concat(structure.query3);
			structure.query1 = tools.wrap.bool([{must:structure.query1}]);
		}else{
			if(structure.query3.length){
				structure.query1 = [tools.wrap.bool([{should:structure.query1}])].concat(structure.query3);
				structure.query1 = tools.wrap.bool([{must:structure.query1}]);
			}else{
				structure.query1 = tools.wrap.bool([{should:structure.query1}]);
			}
		}

		structure.query1 = [
			tools.wrap.nested('tracks',structure.query1,{inner_hits:{}})
		];
		structure.query = tools.wrap.bool([{must:structure.query1}]);
		var fs = tools.wrap.function_score({score_mode:'sum',boost_mode:'multiply'});
		fs = tools.wrap.function_score_add(fs,structure.filters);
		fs = tools.wrap.function_score_add(fs,structure.query);
		var body = {index:db_index,type:'album',size:10,body:{query:fs}};



		elastic.client.search(body,function(err,data){
			if(err){
				console.Yolk.error(err);
				//console.Yolk.warn(JSON.stringify(body,false,2))
				resolve('database error while looking for track in albums');
			}

			if(data.hits.hits.length){
				var albumtrack = data.hits.hits[0].inner_hits.tracks.hits.hits[0]._source;
				track.filter={};
				track.deleted = 'no';
				if(track.type!=='youtube'){
					track.metadata.album = tools.fix(data.hits.hits[0]._source.metadata.title);
					track.album=data.hits.hits[0]._source.id;
				}
				track.metadata.title = tools.fix(albumtrack.title2 || albumtrack.title);
				track.metadata.artist = tools.fix(albumtrack.artist.name);
				track.date = Date.now();
				track.musicbrainzed ='yes',
				track.musicbrainz_id = albumtrack.id.toString();
				track.artist=albumtrack.artist.id.toString();

				elastic.client.search({
					index:db_index,
					type:track.type,
					body:{query:{match:{"musicbrainz_id.exact":{query:track.musicbrainz_id,type:'phrase'}}}}
				},function(err,data){
					if(err){
						console.Yolk.error(err);
						resolve('database error in duplicate lookup')
					}else if(!data.hits.hits.length){

						saveTrack(track);
						self.add({
							type:'artist',
							id:track.artist,
							title:track.metadata.artist
						});
						reject();
					}else{
						resolve('track with that mbid already exists')
					}
				})
			}else{
				resolve('no track found from albums');
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
		if(!dupes.mbid){
			dupes.mbid = []
		}

		if(dupes[track.type].indexOf(track.id) > -1 || dupes.mbid.indexOf(track.musicbrainz_id || 'notmusicbrainzed') > -1){
			reject();
		}else{
			dupes[track.type].push(track.id);
			if(track.musicbrainz_id) dupes.mbid.push(track.musicbrainz_id);
			var body = {query:{bool:{must:[{bool:{should:[
				{match:{id:{query:track.id}}},
				{match:{"musicbrainz_id.exact":{query:track.musicbrainz_id||'notmusicbrainzed',type:'phrase'}}}
			]}}]}}}
			if(['local','internetarchive','youtube'].indexOf(track.type) > -1){
				body.query.bool.must.push({match:{musicbrainzed:{query:'yes',type:'phrase'}}})
			}
			elastic.client.search({
				index:db_index,
				type:track.type,
				body:body
			},function(err,data){
				if(err){
					console.Yolk.error(err);
					resolve();
				}
				if(data.hits.hits.length){
					reject();
				}else{
					resolve();
				}

			})
		}
	})
}
musicbrainz.prototype.add = function(track,resub){
	var self = this;

	//strip out the "’" quotations which confuse the hell out of elasticsearch
	if(track.metadata){
		Object.keys(track.metadata).forEach(function(key){
			track.metadata[key] = tools.fix(track.metadata[key]);
		});
	}else if(track.type!=='album' && track.type!=='artist'){
		console.Yolk.error(track);
		return;
	}

	this.dupe(track).then(function(){
		//construct the musicbrainz query string
		try {
			if(track.type === 'album'){
				track.query = mb_url+'release/'+track.id+'?fmt=json&inc=recordings+artists+artist-rels+artist-credits+url-rels+release-groups+recording-level-rels+work-level-rels';
				mbq.album.unshift(track);
			}else if(track.type === 'artist'){
				track.query = mb_url+'artist/'+track.id+'?fmt=json&inc=url-rels';
				mbq.other.push(track);
			}else if(track.type === 'youtube'){
				//mbq.youtube.push(track);
			}else{
				track = tools.musicbrainz(track);
				if(track && track.fix){
					mbq.fix.push(track);
				}else if(track){
					mbq.other.unshift(track);
				}
			}
		}
		catch(err){
			console.Yolk.error(err.stack);
		}
		if(resub){
			mbq.other.unshift(resub);
		}
		self.pacer();
	},function(){
		if(resub){
			mbq.other.unshift(resub);
		}
		self.pacer();
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
