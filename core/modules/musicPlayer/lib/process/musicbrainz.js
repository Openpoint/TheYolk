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
	fix:[],
	artist:[]
};
var kill = false;
var busy = false;
var dupes;
function getDupes(){
	dupes = {mbid:[],album:[],artist:[],local:[],internetarchive:[],youtube:[]};
	elastic.fetchAll({index:db_index,type:'local,internetarchive,youtube',body:{query:{match:{musicbrainzed:{query:'yes',type:'phrase'}}},_source:['musicbrainz_id','id','type']}}).then(function(data){
		data.forEach(function(track){
			if(!dupes[track.type]){dupes[track.type]=[]}
			dupes[track.type].push(track.id)
			if(track.musicbrainz_id){dupes.mbid.push(track.musicbrainz_id)}
		})
		console.Yolk.log(dupes)
	})
	elastic.fetchAll({index:db_index,type:'album,artist',body:{query:{},_source:['id','name']}}).then(function(data){

		data.forEach(function(track){
			track.name?dupes.artist.push(track.id) : dupes.album.push(track.id)
		})
	})
}

var musicbrainz = function(){
	this.pace = 1000; //set the speed limit for MusicBrainz API calls
}
//limit the submission rate to musicbrainz server to sane
musicbrainz.prototype.pacer=function(bounce){
	var self = this;
	if(bounce || busy){
		clearTimeout(this.timeout);
		this.timeout = false;
		if(busy){
			console.Yolk.say('BUSY');
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
		size:mbq.other.length+mbq.album.length+mbq.fix.length
	});
	if(!(mbq.album.length+mbq.other.length+mbq.fix.length) && (dupes && dupes.newalbums && dupes.newalbums.length)){
		mbtools.fixAlbums(dupes.newalbums);
		dupes.newalbums = [];
	}
	if(mbq.album.length+mbq.other.length+mbq.artist.length+mbq.fix.length){
		if(mbq.album.length){
			var track = mbq.album.shift();
		}else if(mbq.fix.length){
			var track = mbq.fix.shift();
		}else if(mbq.other.length){
			var track = mbq.other.shift();
		}else{
			var track = mbq.artist.shift();
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
//check for duplicates
musicbrainz.prototype.dupe = function(track){
	var self = this;
	if(dupes[track.type].indexOf(track.id) > -1 || dupes.mbid.indexOf(track.musicbrainz_id || 'notmusicbrainzed') > -1){
		return true;
	}else{
		dupes[track.type].push(track.id);
		if(track.musicbrainz_id) dupes.mbid.push(track.musicbrainz_id);
		return false;
	}
}

//add a track to the processing queue
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
	if(!this.dupe(track)){
		//construct the musicbrainz query string
		try {
			if(track.type === 'album'){
				track.query = mb_url+'release/'+track.id+'?fmt=json&inc=recordings+artists+artist-rels+artist-credits+url-rels+release-groups+recording-level-rels+work-level-rels';
				mbq.album.unshift(track);
				busy = false;
				if(!dupes.newalbums)(dupes.newalbums=[])
				dupes.newalbums.push(track.id);
			}else if(track.type === 'artist'){
				track.query = mb_url+'artist/'+track.id+'?fmt=json&inc=url-rels';
				mbq.artist.push(track);
				busy = false;
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
			var c;
			resub.fix?c = 'fix' : c = 'other'
			resub.fix = false;
			mbq[c].unshift(resub);
		}
		self.pacer();
	}else{
		if(resub){
			var c;
			resub.fix?c = 'fix' : c = 'other'
			resub.fix = false;
			mbq[c].unshift(resub);
			busy = false;
		}
		self.pacer();
	}
}
//submit a query to musicbrainz server
musicbrainz.prototype.submit = function(track){

	var self = this;
	track.deleted = 'no';
	busy = true;

	if(track.type!=='album' && track.type!=='artist'){
		this.fromAlbum(track).then(function(message){ //first try to match the track to an existing album
			if(!track.toalbum){ //this is the tracks first pass, so try to find an album for it
				track.toalbum=1;
				console.Yolk.say(track.type.toUpperCase()+' -------------------------- '+track.metadata.artist+' : '+track.metadata.album+' : '+track.metadata.title+' | '+track.musicbrainz_id);
				new go(track,self);
			}else{ //this is the tracks second pass and no album was found, so mark it as deleted
				track.deleted = 'yes';
				track.deleted_reason = message;
				mbtools.saveTrack(track).then(function(){
					console.Yolk.say(message.toUpperCase()+' -------------------------- '+track.metadata.artist+' : '+track.metadata.album+' : '+track.metadata.title+' | '+track.musicbrainz_id);
					busy = false;
					self.pacer();
				});
			}
		},function(track){ //track was successfully matched to an album
			console.Yolk.say('FROM ALBUM --------------------- '+track.metadata.artist+' : '+track.metadata.album+' : '+track.metadata.title)
			busy = false;
			self.pacer(true);
		})
	}else{
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
				console.Yolk.say('no error')
				try{
					var tt = JSON.parse(body);
				}
				catch(err){
					var tt=false;
					console.Yolk.error(err);
					busy = false;
					return;
				}
				if(track.fix){
					track.metadata.artist = tools.fix(tt['artist-credit'][0].artist.name);
					track.metadata.title = tools.fix(tt.title);
					if(track.musicbrainz_id !== tt.id){
						track.musicbrainz_id = tt.id;
						if(!self.dupe(track)){
							dupes.mbid.push(tt.id)
						}else{
							busy = false;
							return;
						}
					}
					if(tt.length){
						track.duration = Number(tt.length)
					}else{
						track.duration = 0;
					}
				}

				//save and return if album or artist lookup
				if(track.type === 'artist'||track.type === 'album'){

					mbtools.saveMeta(track.type,tt).then(function(message){
						busy = false;
						console.Yolk.say(message);
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
					console.Yolk.warn('No releases found for '+track.metadata.artist+': '+track.metadata.album+': '+track.metadata.title);
					track.deleted = 'yes'
					track.deleted_reason = 'no releases found for track';
					mbtools.saveTrack(track).then(function(){
						busy = false;
					});
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
							query1:[/*initial "should" inside of nested "must"*/
								tools.wrap.constant_score({match:{'tracks.title.exact':{query:track.metadata.title}}},{boost:100}),
								tools.wrap.constant_score({match:{'tracks.title2.exact':{query:track.metadata.title}}},{boost:100})
							],
							query2:[/*additional queries inside of nested "must"*/],
							query3:[/*queries inside of nested "should"*/],
							query4:[/*additional queries inside of outer "must"*/],
							query5:[/*queries inside of outer "should"*/],

							filters:[
								tools.wrap.filter({match:{"type.exact":{query:'album',type:'phrase'}}},{weight:5}),
								tools.wrap.filter({match:{"status.exact":{query:'official',type:'phrase'}}},{weight:5}),
								tools.wrap.filter({match:{"type2.exact":{query:'lp'}}},{weight:10}),


								tools.wrap.filter(tools.wrap.bool([{must:[

									{match:{"type.exact":{query:'album',type:'phrase'}}},
									{match:{"status.exact":{query:'official',type:'phrase'}}},
									{match:{"type2.exact":{query:'lp',type:'phrase'}}}

								]}]),{weight:8}),


								tools.wrap.filter({match:{"type2.exact":{query:'single',type:'phrase'}}},{weight:2}),
								tools.wrap.filter({match:{"type2.exact":{query:'soundtrack',type:'phrase'}}},{weight:3}),
								tools.wrap.filter({match:{"type2.exact":{query:'compilation',type:'phrase'}}},{weight:3}),
								tools.wrap.filter({match:{"type2.exact":{query:'live',type:'phrase'}}},{weight:2}),
								tools.wrap.filter({match:{country:{query:'US',type:'phrase'}}},{weight:2}),
								tools.wrap.filter({match:{country:{query:'GB',type:'phrase'}}},{weight:5}),
								tools.wrap.filter({match:{format:{query:'vinyl',fuzziness:'auto'}}},{weight:8}),
								tools.wrap.filter({match:{format:{query:'cd',type:'phrase'}}},{weight:4}),
							]
						}

						var postfix = tools.postfix(track.metadata.title);
						if(postfix){
							structure.query3.push(tools.wrap.constant_score(
								tools.wrap.nested('tracks.disambig',{match:{"tracks.disambig.dis":{query:postfix.postfix,type:'phrase',slop:2}}})
							,{boost:100}))
						}
						['tracks.title','tracks.title2'].forEach(function(add){
							if(postfix){
									var match = {};
									match[add]={query:postfix.prefix,type:'phrase'}
									structure.query1.push(tools.wrap.constant_score({match:match},{boost:50}));
									/*
									var match2 = {};
									match2[add]={query:postfix.postfix,type:'phrase',slop:2}
									structure.query3.push(tools.wrap.constant_score({match:match2},{boost:20}));
									*/

							}else{
								var match = {};
								match[add] = {query:track.metadata.title,minimum_should_match:2};
								structure.query1.push(tools.wrap.constant_score({match:match},{boost:50}))
							}
						})
						if(track.metadata.artist && !track.classical){
							structure.query2.push(
								tools.wrap.constant_score({match:{'tracks.artist.name':{query:track.metadata.artist}}})
							)
						}
						if(track.metadata.album && track.metadata.album !=='youtube'){
							var foo = tools.wrap.bool([{should:[
								tools.wrap.constant_score({match:{'tracks.title':{query:track.metadata.title,minimum_should_match:1}}}),
								tools.wrap.constant_score({match:{'tracks.title2':{query:track.metadata.title,minimum_should_match:1}}})
							]}]);
							foo = tools.wrap.nested('tracks',foo)
							postfix = tools.postfix(track.metadata.album);

							if(postfix){
								foo = foo = tools.wrap.constant_score(tools.wrap.bool([{must:[{match:{album:{query:postfix.prefix,type:'phrase'}}},foo]}]),{boost:500});

								structure.query3.push(tools.wrap.constant_score(
									tools.wrap.nested('tracks.disambig',{match:{"tracks.disambig.dis":{query:postfix.postfix,minimum_should_match:2}}}),{boost:200}
								));

								structure.query5.push(tools.wrap.constant_score({match:{'album':{query:postfix.postfix,minimum_should_match:1}}},{boost:20}));
							}else{
								foo = tools.wrap.constant_score(
									tools.wrap.bool([{must:[{match:{'album':{query:track.metadata.album,type:'phrase',slop:2}}},foo]}]),{boost:500}
								);
							}
							structure.query5.push(foo);
						}
						if(track.musicbrainz_id){
							structure.query2.push(tools.wrap.constant_score({match:{'tracks.id.exact':{query:track.musicbrainz_id,type:'phrase'}}}));
						}
						if(track.duration && !track.musicbrainz_id){
							var range = tools.wrap.constant_score({range:{'tracks.length':{
								gte:(Math.floor(track.duration/1000)*1000)-500,
								lte:(Math.ceil(track.duration/1000)*1000)+500
							}}},{boost:100});
							var zero = tools.wrap.constant_score({term:{'tracks.length':0}});
							var duration = tools.wrap.bool([{should:[range,zero]}]);
							structure.query3.push(duration);
						}

						structure.query1 = [tools.wrap.bool([{should:structure.query1}])];
						structure.query1 = tools.wrap.bool([{must:structure.query1.concat(structure.query2)},{should:structure.query3}]);
						structure.query1 = [tools.wrap.nested('tracks',structure.query1,{inner_hits:{}})];
						structure.query1 = tools.wrap.bool([{must:structure.query1.concat(structure.query4)},{should:structure.query5}]);

						var fs = tools.wrap.function_score({score_mode:'sum',boost_mode:'multiply'});
						fs = tools.wrap.function_score_add(fs,structure.filters);
						fs = tools.wrap.function_score_add(fs,structure.query1);
						var body = {index:db_index,type:'release',size:100,body:{query:fs}};

						//console.Yolk.warn(JSON.stringify(body,true,2))

						elastic.client.search(body,function(err,data){
							if(err){
								console.Yolk.error(err);
								busy = false;
								return;
							}
							var hits = data.hits.hits.filter(function(album){
								if(album.inner_hits.tracks.hits.hits.length){return album}
							})

							if(hits.length && hits[0]._score > 500){



								var highscore = hits[0]._score;
								var hits = data.hits.hits.filter(function(album){
									if(album._score === highscore ){return album}
								})
								if(hits.length > 1){
									hits.sort(function compare(a,b) {
										if (!a._source.date){return 1;}
										if (!b._source.date){return -1;}
										if (a._source.date < b._source.date){return -1;}
										if (a._source.date > b._source.date){return 1;}
										return 0;
									})
									var album = hits[0]
								}else{
									var album = hits[0]
								}

								var newtitle = tools.fix(album.inner_hits.tracks.hits.hits[0]._source.title);
								var newartist = tools.fix(album.inner_hits.tracks.hits.hits[0]._source.artist.name);
								var newalbum = tools.fix(album._source.album);
								var newlength = album.inner_hits.tracks.hits.hits[0]._source.length;

								if(newlength && !track.duration){
									track.duration = newlength;
								}

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
								var Album = {
									type:'album',
									id:album._source.id,
									title:track.metadata.album
								}
								track.album = Album.id;
								track.musicbrainz_id = album.inner_hits.tracks.hits.hits[0]._source.id;
								self.add(Album,track);

							}else{
								if(hits.length){
									var message = 'NO RELEASES | '+highscore+' | '+track.metadata.artist+' : '+track.metadata.album+' : '+track.metadata.title+' | '+track.musicbrainz_id;
								}else{
									var message = 'NO RELEASES | '+track.metadata.artist+' : '+track.metadata.album+' : '+track.metadata.title+' | '+track.musicbrainz_id;
								}
								console.Yolk.say(message);
								if(track.fix){track.fix=false}
								track.deleted = 'yes';
								track.deleted_reason = message;
								mbtools.saveTrack(track).then(function(){
									busy = false;
								});
							}
						})
					}
				})
			}else{
				console.Yolk.warn('Error in musicbrainz lookup')
				var types = {youtube:'youtube',artist:'artist',local:'other',internetarchive:'other',album:'album'};
				if(response){
					response = response.toJSON();
					console.Yolk.say(response.statusCode)
					if((response.statusCode === 503 || response.statusCode === 500) && !kill){
						if(track.toalbum){track.toalbum--}
						if(track.fix){mbq.fix.unshift(track);}else{mbq[types[track.type]].unshift(track);}
					}
				}
				if(error){
					console.Yolk.error(error);
					if(track.fix){mbq.fix.push(track)}else{mbq[types[track.type]].push(track)}
				}
				busy = false;
				self.pacer();
			}
		})
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
		var artist;
		track.classical && track.classical.composer ? artist=track.classical.composer : artist = track.metadata.artist;
		if(!track.musicbrainz_id && (!track.metadata.title || (!track.metadata.artist && !track.metadata.album))){
			resolve();
		}
		var structure = {
			query1:[/*initial "should" inside of nested "must"*/
				tools.wrap.constant_score({match:{'tracks.title.exact':{query:track.metadata.title}}},{boost:100}),
				tools.wrap.constant_score({match:{'tracks.title2.exact':{query:track.metadata.title}}},{boost:100})
			],
			query2:[/*additional queries inside of nested "must"*/],
			query3:[/*queries inside of nested "should"*/],
			query4:[/*additional queries inside of outer "must"*/],
			query5:[/*queries inside of outer "should"*/],

			filters:[
				tools.wrap.filter({match:{primary_type:{query:'album'}}},{weight:5}),
				tools.wrap.filter({match:{secondary_type:{query:'lp'}}},{weight:10}),
				tools.wrap.filter({match:{secondary_type:{query:'single'}}},{weight:4}),
				tools.wrap.filter({match:{secondary_type:{query:'compilation'}}},{weight:3}),
				tools.wrap.filter({match:{secondary_type:{query:'live'}}},{weight:2}),
				tools.wrap.filter({match:{country:{query:'US',type:'phrase'}}},{weight:2}),
				tools.wrap.filter({match:{country:{query:'GB',type:'phrase'}}},{weight:5}),

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
			structure.query3.push(tools.wrap.constant_score(
				tools.wrap.nested('tracks.disambig',{match:{"tracks.disambig.dis":{query:postfix.postfix,type:'phrase',slop:2}}})
			,{boost:100}))
		}
		['tracks.title','tracks.title2'].forEach(function(add){
			if(postfix){
					var match = {};
					match[add]={query:postfix.prefix,type:'phrase'}
					structure.query1.push(tools.wrap.constant_score({match:match},{boost:50}));
					/*
					var match2 = {};
					match2[add]={query:postfix.postfix,type:'phrase',slop:2}
					structure.query3.push(tools.wrap.constant_score({match:match2},{boost:20}))
					*/
			}else{
					var match = {};
					match[add] = {query:track.metadata.title,minimum_should_match:2};
					structure.query1.push(tools.wrap.constant_score({match:match},{boost:50}))
			}
		})
		if(track.metadata.artist){
			structure.query2.push(tools.wrap.bool([{should:[
					tools.wrap.constant_score({match:{'tracks.artist.name':{query:artist}}}),
					tools.wrap.nested('tracks.artists',tools.wrap.constant_score({match:{'tracks.artists.name':{query:artist}}}))
			]}]))
		}
		if(!track.musicbrainz_id && (track.metadata.album && track.metadata.album !=='youtube')){
			var foo = tools.wrap.bool([{should:[
				tools.wrap.constant_score({match:{'tracks.title':{query:track.metadata.title,minimum_should_match:1}}}),
				tools.wrap.constant_score({match:{'tracks.title2':{query:track.metadata.title,minimum_should_match:1}}})
			]}]);
			foo = tools.wrap.nested('tracks',foo)
			postfix = tools.postfix(track.metadata.album);

			if(postfix){
				foo = tools.wrap.bool([{must:[{match:{'metadata.title':{query:postfix.prefix,type:'phrase'}}},foo]}]);
				structure.filters.push(tools.wrap.filter({match:{'metadata.title':{query:postfix.postfix,minimum_should_match:2}}},{weight:10}));
				structure.query3.push(tools.wrap.constant_score(
					tools.wrap.nested('tracks.disambig',{match:{"tracks.disambig.dis":{query:postfix.postfix,minimum_should_match:2}}}),{boost:200}));
			}else{
				foo = tools.wrap.bool([{must:[{match:{'metadata.title':{query:track.metadata.album,type:'phrase',slop:2}}},foo]}]);
			}
			structure.query4.push(foo);
		}
		if(track.musicbrainz_id){
			structure.query2.push(tools.wrap.constant_score({match:{'tracks.id.exact':{query:track.musicbrainz_id}}}))
		}
		if(track.duration && !track.musicbrainz_id){
			var range = tools.wrap.constant_score({range:{'tracks.length':{
				gte:(Math.floor(track.duration/1000)*1000)-500,
				lte:(Math.ceil(track.duration/1000)*1000)+500
			}}},{boost:100});
			var zero = tools.wrap.constant_score({term:{'tracks.length':0}});
			var duration = tools.wrap.bool([{should:[range,zero]}]);
			structure.query3.push(duration);
		}

		structure.query1 = [tools.wrap.bool([{should:structure.query1}])];
		structure.query1 = tools.wrap.bool([{must:structure.query1.concat(structure.query2)},{should:structure.query3}]);
		structure.query1 = [tools.wrap.nested('tracks',structure.query1,{inner_hits:{}})];
		structure.query1 = tools.wrap.bool([{must:structure.query1.concat(structure.query4)},{should:structure.query5}]);

		var fs = tools.wrap.function_score({score_mode:'sum',boost_mode:'multiply'});
		fs = tools.wrap.function_score_add(fs,structure.filters);
		fs = tools.wrap.function_score_add(fs,structure.query1);
		var body = {index:db_index,type:'album',size:10,body:{query:fs}};
		elastic.client.search(body,function(err,data){
			if(err){
				console.Yolk.error(err);
				resolve('database error while looking for track in albums');
				busy = false;
			}

			if(data.hits && data.hits.hits.length){
				var albumtrack = data.hits.hits[0].inner_hits.tracks.hits.hits[0]._source;

				//console.Yolk.warn(albumtrack);

				track.filter={};
				track.deleted = 'no';
				if(track.type!=='youtube'){
					var newalbum = tools.fix(data.hits.hits[0]._source.metadata.title);
					if(newalbum !== track.metadata.album){
						track.metadata.old_album2 = track.metadata.album;
						track.metadata.album = newalbum;
					}
					track.album=data.hits.hits[0]._source.id;
				}
				var newtitle = albumtrack.title2 || albumtrack.title;
				if(newtitle !== track.metadata.title){
					track.metadata.old_title2 = track.metadata.title;
					track.metadata.title = newtitle;
				}
				var newartist = tools.fix(albumtrack.artist.name);
				if(track.metadata.artist!==newartist){
					track.metadata.old_artist2 = track.metadata.artist
					track.metadata.artist = newartist;
				}

				track.date = Date.now();
				track.musicbrainzed ='yes',
				track.musicbrainz_id = albumtrack.id.toString();
				track.artist=albumtrack.artist.id.toString();
				track.disambig = albumtrack.disambig

				//first check for duplicate
				elastic.client.search({
					index:db_index,
					type:track.type,
					body:{query:{match:{"musicbrainz_id.exact":{query:track.musicbrainz_id,type:'phrase'}}}}
				},function(err,data){
					if(err){
						console.Yolk.error(err);
						resolve('database error in duplicate lookup');
						busy = false;
					}else if(!data.hits.hits.length){
						//then save the track
						mbtools.saveTrack(track).then(function(){
							self.add({
								type:'artist',
								id:track.artist,
								title:track.metadata.artist
							});
							reject(track);
						});

					}else{
						resolve('track with that mbid already exists')
					}
				})
			}else{
				resolve('no track found from albums');
			}
		})
	})
	self.pacer();
}

if(!mbz){
	var mbz = new musicbrainz();
}


//listen for incoming data
ipcMain.on('musicbrainz', function(event, track) {
	mbz.add(track);
})
ipcMain.on('kill', function(event,data) {

	if(data === 'revive'){
		kill = false;
		busy = false;
		getDupes();
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

module.exports = mbz;
