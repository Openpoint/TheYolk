'use strict'

/*
 * Establishes a queue of found tracks to submit to the MusicBrainz metadata lookup service. Lookup rate is limited by MusicBrainz as per their
 * rules at http://musicbrainz.org/doc/XML_Web_Service/Rate_Limiting
 *
 * */
require('../tools/musicbrainzclassical.js');
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
	artist:[],
	ytartist:[]
};
const log = false; //turn on detailed logging for music lookups
var noAlbum=[];
var kill = false;
var busy = false;
var dupes;

var musicbrainz = function(){
	this.pace = 1000; //set the speed limit for MusicBrainz API calls
}

function getDupes(){

	dupes = {mbid:[],album:[],artist:[],local:[],internetarchive:[],youtube:[],newalbums:[]};
	elastic.fetchAll({index:db_index,type:'local,internetarchive,youtube',body:{query:{match:{musicbrainzed:{query:'yes',type:'phrase'}}},_source:['musicbrainz_id','id','type','fix']}}).then(function(data){
		data.forEach(function(track){
			if(!dupes[track.type]){dupes[track.type]=[]}
			dupes[track.type].push(track.id);
			if(track.musicbrainz_id){dupes.mbid.push({mbid:track.musicbrainz_id,auth:track.auth,type:track.type,id:track.id,rating:track.rating,downloads:track.downloads})}else{
				mbz.add(track);
			}
		})
	})
	elastic.fetchAll({index:db_index,type:'album,artist',body:{query:{},_source:['id','name']}}).then(function(data){
		data.forEach(function(track){
			track.name?dupes.artist.push(track.id) : dupes.album.push(track.id)
		})
	})
}

//limit the submission rate to musicbrainz server to sane
musicbrainz.prototype.pacer=function(bounce){
	var self = this;
	if(bounce || busy){
		clearTimeout(this.timeout);
		this.timeout = false;
		if(busy){
			if(log) console.Yolk.say('BUSY');
			this.timeout = setTimeout(function(){
				self.timeout = false;
				self.pacer();
			},self.pace);
		}
	}
	if(this.timeout){
		return;
	}
	if(log) console.Yolk.say('*************************************************************************************************************************************** album: '+mbq.album.length+' | fix: '+mbq.fix.length+' | youtube:'+mbq.youtube.length+' | other:'+mbq.other.length+' | ytartist:'+mbq.ytartist.length+' -------BUFFER:'+buffer.length);

	message.send('progress',{
		type:'musicbrainz',
		//context:track.type,
		size:mbq.other.length+mbq.album.length+mbq.fix.length+mbq.youtube.length+mbq.ytartist.length+buffer.length
	});
	if(!(mbq.album.length+mbq.other.length+mbq.fix.length+mbq.youtube.length+buffer.length) && (dupes && dupes.newalbums && dupes.newalbums.length)){
		mbtools.fixAlbums(dupes.newalbums);
		dupes.newalbums = [];
	}
	if(mbq.album.length+mbq.other.length+mbq.artist.length+mbq.fix.length+mbq.youtube.length+mbq.ytartist.length){
		if(mbq.ytartist.length){
			var art = mbq.ytartist.shift();
		}else if(mbq.album.length){
			var track = mbq.album.shift();
		}else if(mbq.artist.length){
			var track = mbq.artist.shift();
		}else if(mbq.fix.length){
			var track = mbq.fix.shift();
		}else if(mbq.other.length){
			var track = mbq.other.shift();
		}else{
			var track = mbq.youtube.shift();
		}
		if(art) self.getYtartist(art);
		if(track) self.submit(track);
		this.timeout = setTimeout(function(){
			self.timeout = false;
			self.pacer();
		},self.pace);

	}else{
		this.timeout = false;
	}
}
//"delete" the old track
function remove(dupe){
	elastic.client.update({index:db_index,type:dupe.type,id:dupe.id,body:{doc:{deleted:'yes',deleted_reason:'Found duplicate mbid'},doc_as_upsert:true},refresh:true})
}

//check for duplicates
musicbrainz.prototype.dupe = function(track,skip){

	var self = this;
	if(dupes[track.type].indexOf(track.id) > -1 && !skip){return true;}
	if(!skip) dupes[track.type].push(track.id);
	if(dupes.mbid.some(function(dupe){

			if(dupe.mbid === track.musicbrainz_id){
				//console.Yolk.error(track.downloads*1+' > '+dupe.downloads*1+' : '+(track.downloads*1 > dupe.downloads*1))
				if(dupe.type === track.type && dupe.auth){return true}else
				if(dupe.type === track.type && (track.fix||track.auth)){remove(dupe);return false;}else
				if(dupe.type === track.type && track.type==='youtube' && track.rating*1 > dupe.rating*1){

					remove(dupe);
					return false;
				}else
				if(dupe.type === track.type && track.type==='internetarchive' && track.downloads*1 > dupe.downloads*1){
					//console.Yolk.error(track)
					remove(dupe);
					return false;
				}else
				if(dupe.type === track.type){return true}else
				if(dupe.type === 'local'||track.type === 'youtube'){
					if(track.type === 'youtube'){return false}
					return true;
				}else
				if(dupe.type !== 'local' && dupe.type !== 'youtube' && track.type === 'local'){
					remove(dupe);
					return false;
				}else{return true}
			}else{return false}
		})
	){return true}else{return false}
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
				//if(!dupes.newalbums)(dupes.newalbums=[])
				if(!track.youtube) dupes.newalbums.push(track.id);
			}else if(track.type === 'artist'){
				track.query = mb_url+'artist/'+track.id+'?fmt=json&inc=url-rels';
				mbq.artist.push(track);
				busy = false;
			}else if(track.type === 'youtube'){
				track = mbtools.musicbrainz(track);
				mbq.youtube.push(track);
			}else{
				track = mbtools.musicbrainz(track);
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
			if(resub.fix){
				c = 'fix';
				resub.auth = true;
			}else{c = 'other'}
			delete resub.fix;
			mbq[c].unshift(resub);
		}
		self.pacer();
	}else{
		busy = false;
		if(resub){
			var c;
			if(resub.fix){
				c = 'fix';
				resub.auth = true;
			}else{c = 'other'}
			delete resub.fix;
			mbq[c].unshift(resub);
		}
		self.pacer();
	}
}
//get details on an unknown youtube artist
musicbrainz.prototype.getYtartist = function(artist){

	var query = 'https://musicbrainz.org/ws/2/artist/?query=artist:"'+tools.queryBuilder(artist)+'"&fmt=json&limit=1'
	var options={
		headers:headers,
		url:query
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
				return;
			}
			if(log) console.Yolk.say(tt)
			if(tt.artists && tt.artists[0] && tt.artists[0].name){
				var newart = tools.fix(tt.artists[0].name);
			}else{
				message.send('mb_'+artist,false);
				return;
			}

			if(newart.split(' ').length === artist.split(' ').length || tools.strim(newart).indexOf(tools.strim(artist)) > -1) {
				message.send('mb_'+artist,{key:artist,canon:newart})
			}else{
				message.send('mb_'+artist,false)
			}
		}else{
			mbq.ytartist.unshift(artist)
		}
	})

}
//submit a query to musicbrainz server
musicbrainz.prototype.submit = function(track){

	if(log) console.Yolk.say(track)
	var self = this;
	track.deleted = 'no';
	busy = true;

	if(track.type!=='album' && track.type!=='artist'){
		if(track.fix && !track.metadata.title){
			go(track,self);
			return;
		}
		this.fromAlbum(track).then(function(message){ //first try to match the track to an existing album
			if(!track.toalbum && message!=='track with that mbid already exists'){ //this is the tracks first pass, so try to find an album for it
				track.toalbum=1;
				if(log) console.Yolk.say(track.type.toUpperCase()+' -------------------------- '+track.metadata.artist+' : '+track.metadata.album+' : '+track.metadata.title+' | '+track.musicbrainz_id);
				new go(track,self);
			}else{ //this is the tracks second pass and no album was found, so mark it as deleted
				track.deleted = 'yes';
				track.deleted_reason = message;
				mbtools.saveTrack(track).then(function(){
					if(log) console.Yolk.say(message.toUpperCase()+' -------------------------- '+track.metadata.artist+' : '+track.metadata.album+' : '+track.metadata.title+' | '+track.musicbrainz_id);
					busy = false;
					self.pacer(true);
				});
			}
		},function(track){ //track was successfully matched to an album
			if(log) console.Yolk.say('FROM ALBUM --------------------- '+track.metadata.artist+' : '+track.metadata.album+' : '+track.metadata.title)
			busy = false;
			self.pacer(true);
		})
	}else{
		if(log) console.Yolk.say(track.type.toUpperCase()+' -------------------------- '+track.title+' | '+track.id);
		new go(track,self);
	}

	//submit item to Musicbrainz server
	function go(track,self){

		var options={
			headers:headers,
			url:track.query
		};
		if(log) console.Yolk.say('Submitting request to MusicBrainz server');
		request.get(options,function(error, response, body){
			if(kill){return;}
			if (!error && response.statusCode == 200) {
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
					}
					if(tt.length){
						track.duration = Number(tt.length)
					}else{
						track.duration = 0;
					}
				}

				//save and return if album or artist lookup
				if(track.type === 'artist'||track.type === 'album'){
					mbtools.saveMeta(track,tt,track.type==='album' ? dupes.newalbums:false).then(function(message){
						busy = false;
						if(log) console.Yolk.say(message);
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
					if(log) console.Yolk.warn('No releases found for '+track.metadata.artist+': '+track.metadata.album+': '+track.metadata.title);
					track.deleted = 'yes'
					track.deleted_reason = 'no releases found for track';
					mbtools.saveTrack(track).then(function(){
						busy = false;
					});
					return
				}
				if(log) console.Yolk.say('Saving '+((releases.length)/2)+' releases to db');

				if(log && releases.length > 1000) console.Yolk.warn(track.query);

				//First save the found releases to database

				elastic.client.bulk({body:releases,refresh:true},function(err,data){
					if(err){
						console.Yolk.error(err);
						new go(track,self);
					}else{

				if(log) console.Yolk.say('Quering db for best release')
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

							}else{
								var match = {};
								match[add] = {query:track.metadata.title,minimum_should_match:2};
								structure.query1.push(tools.wrap.constant_score({match:match},{boost:50}))
							}
						})
						if(track.type === 'youtube'){
							structure.query1.push({match:{'tracks.title':{query:track.metadata.title,minimum_should_match:3}}})
							structure.query1.push({match:{'tracks.title2':{query:track.metadata.title,minimum_should_match:3}}})
							if(!track.artists) track.artists=[]
							var artists = [{match:{'tracks.artist.name':{query:track.metadata.artist,type:'phrase'}}}]
							track.artists.forEach(function(artist){
								artists.push({match:{'tracks.artist.name':{query:artist.name,type:'phrase'}}})
							})
							artists = tools.wrap.bool([{should:artists}]);
							structure.query2.push(artists);
						}
						if(track.classical){
							structure.query1.push(tools.wrap.constant_score({match:{"tracks.title":{query:track.metadata.title,fuzziness:'auto'}}}))
							structure.query1.push(tools.wrap.constant_score({match:{"tracks.title2":{query:track.metadata.title,fuzziness:'auto'}}}))
							if(!track.musicbrainz_id) structure.query2.push(tools.wrap.constant_score({match:{"tracks.artist.name":{query:track.classical.composer,type:'phrase'}}}))
							if(track.metadata.album){
								structure.query3.push(tools.wrap.constant_score({match:{"album":{query:track.metadata.album}}},{boost:10}))
							}
							if(!track.musicbrainz_id){
								if(track.classical.artist){
									var credits = []
									track.classical.artist.forEach(function(artist){
										credits.push({match:{"tracks.artists.name":{query:artist.name,type:'phrase'}}})
									})
									credits = tools.wrap.nested('tracks.artists',tools.wrap.bool([{should:credits}]));
									structure.query2.push(tools.wrap.constant_score(credits));
								}
								function pushtype(pos,q,options){
									var opt = {
										auto_generate_phrase_queries:true,
										default_operator:'AND',
									}
									Object.keys(options).forEach(function(key){opt[key] = options[key]})
									var queries = []
									var pos = 'query'+pos;
									q.forEach(function(query){
										var opt1={},opt2={},opt3={};
										Object.keys(opt).forEach(function(key){
											opt1[key] = opt[key];
											opt1.query = query;
											opt2[key] = opt[key];
											opt2.query = query;
											opt3[key] = opt[key];
											opt3.query = query;
										})
										opt1.default_field = "tracks.title";
										queries.push(tools.wrap.constant_score({query_string:opt1},{boost:5}));
										opt2.default_field = "tracks.title2";
										queries.push(tools.wrap.constant_score({query_string:opt2},{boost:5}));
										opt3.default_field = "album";
										queries.push(tools.wrap.constant_score({query_string:opt3},{boost:2}));
									})
									structure[pos].push(
										tools.wrap.bool([{should:queries}])
									)
								}

								if(track.classical.cat) pushtype(3,[track.classical.cat.id+'~ '+track.classical.cat.val,track.classical.cat.id+track.classical.cat.val+'~'],{phrase_slop:0});
								if(track.classical.key) pushtype(2,[track.classical.key.join(' ')],{phrase_slop:0});

								if(track.classical.op) {
									var cl = track.classical;
									var op = 'op~ '+cl.op[0];
									if(cl.op[1]) {
										var op1=op+' '+cl.op[1];
										var op2 = op+' '+tools.toroman(cl.op[1]);
										op = op1;
									}
									if(op2){
										pushtype(2,[op,op2],{phrase_slop:2})
									}else{
										pushtype(2,[op],{phrase_slop:2})
									}
								}

								if(track.classical.types) Object.keys(track.classical.types).forEach(function(key){
									var type = key+'~ '+track.classical.types[key];
									pushtype(2,[type],{phrase_slop:0});
								})
							}
						}
						if(track.metadata.artist && !track.classical && track.type!=='youtube'){
							structure.query2.push(
								tools.wrap.constant_score({match:{'tracks.artist.name':{query:track.metadata.artist}}})
							)
						}
						if(track.metadata.album && track.type !=='youtube' && !track.classical){
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
									tools.wrap.bool([{must:[{match:{'album':{query:track.metadata.album,type:'phrase'}}},foo]}]),{boost:500}
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
						structure.query1 = [tools.wrap.nested('tracks',structure.query1,{inner_hits:{
							_source:{includes:['tracks.title','tracks.artist.name','tracks.length','tracks.id']}
						}})];
						structure.query1 = tools.wrap.bool([{must:structure.query1.concat(structure.query4)},{should:structure.query5}]);

						var fs = tools.wrap.function_score({score_mode:'sum',boost_mode:'multiply'});
						fs = tools.wrap.function_score_add(fs,structure.filters);
						fs = tools.wrap.function_score_add(fs,structure.query1);
						var body = {index:db_index,type:'release',size:100,body:{_source:['album','date','id'],query:fs}};

						elastic.client.search(body,function(err,data){
							if(err){
								console.Yolk.error(err);
								busy = false;
								return;
							}

							var hits = data.hits.hits.filter(function(album){
								if(album.inner_hits.tracks.hits.hits.length){return true}
							})

							if(hits.length && hits[0]._score > 500){
								if(log) console.Yolk.say('Found a release')
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
								if(log) console.Yolk.say('Filtered release to high score and oldest')
								var root = album.inner_hits.tracks.hits.hits[0]._source.tracks
								var newtitle = tools.fix(root.title);
								var newartist = tools.fix(root.artist.name);
								var newalbum = tools.fix(album._source.album);
								var newlength = root.length;

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
								if(track.metadata.album!==newalbum && track.type!=='youtube'){
									noAlbum.push(track.metadata.album);
									track.metadata.old_album = track.metadata.album;
									track.metadata.album = newalbum;
								}
								var Album = {
									type:'album',
									id:album._source.id,
									title:track.metadata.album,
									youtube:track.type==="youtube"
								}
								track.album = Album.id;
								track.musicbrainz_id = album.inner_hits.tracks.hits.hits[0]._source.id;
								if(log) console.Yolk.say('Saving album and re-submitting track : '+track.metadata.album+' - '+track.album)
								self.add(Album,track);
							}else{
								if(hits.length){
									var message = 'NO RELEASES | '+highscore+' | '+track.metadata.artist+' : '+track.metadata.album+' : '+track.metadata.title+' | '+track.musicbrainz_id;
								}else{
									var message = 'NO RELEASES | '+track.metadata.artist+' : '+track.metadata.album+' : '+track.metadata.title+' | '+track.musicbrainz_id;
								}
								if(log) console.Yolk.say(message);
								if(track.fix){
									track.auth=true;
									delete track.fix;
								}
								track.deleted = 'yes';
								track.deleted_reason = message;
								mbtools.saveTrack(track).then(function(){busy = false});
							}
						})
					}
				})
			}else{
				if(log){
					console.Yolk.warn('Error in musicbrainz lookup')
					console.Yolk.say(track.query)
				}

				var types = {youtube:'youtube',artist:'artist',local:'other',internetarchive:'other',album:'album'};
				if(response){
					response = response.toJSON();
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
			,{boost:100}));
			structure.query3.push(tools.wrap.constant_score({match:{"tracks.title":{query:postfix.postfix,type:'phrase'}}},{boost:2}))
			structure.query3.push(tools.wrap.constant_score({match:{"tracks.title2":{query:postfix.postfix,type:'phrase'}}},{boost:2}))
		}
		['tracks.title','tracks.title2'].forEach(function(add){
			if(postfix){
					var match = {};
					match[add]={query:postfix.prefix,type:'phrase'}
					structure.query1.push(tools.wrap.constant_score({match:match},{boost:50}));
			}else{
					var match = {};
					match[add] = {query:track.metadata.title,minimum_should_match:2};
					structure.query1.push(tools.wrap.constant_score({match:match},{boost:50}))
			}
		})

		if(track.type === 'youtube'){
			structure.query1.push({match:{'tracks.title':{query:track.metadata.title,minimum_should_match:3}}})
			structure.query1.push({match:{'tracks.title2':{query:track.metadata.title,minimum_should_match:3}}})
			if(!track.artists) track.artists=[]
			var artists = [{match:{'tracks.artist.name':{query:track.metadata.artist,type:'phrase'}}}]
			track.artists.forEach(function(artist){
				artists.push({match:{'tracks.artist.name':{query:artist.name,type:'phrase'}}})
			})
			artists = tools.wrap.bool([{should:artists}]);
			structure.query2.push(artists);
		}

		if(track.classical){
			structure.query1.push(tools.wrap.constant_score({match:{"tracks.title":{query:track.metadata.title,fuzziness:'auto'}}}))
			structure.query1.push(tools.wrap.constant_score({match:{"tracks.title2":{query:track.metadata.title,fuzziness:'auto'}}}))
			if(!track.musicbrainz_id) structure.query2.push(tools.wrap.constant_score({match:{"tracks.artist.name":{query:track.classical.composer,type:'phrase'}}}))
			if(track.metadata.album)structure.query3.push(tools.wrap.constant_score({match:{"metadata.title":{query:track.metadata.album}}},{boost:10}))
			if(!track.musicbrainz_id){
				if(track.classical.artist){
					var credits = []
					track.classical.artist.forEach(function(artist){
						credits.push({match:{"tracks.artists.name":{query:artist.name,type:'phrase'}}})
					})
					credits = tools.wrap.nested('tracks.artists',tools.wrap.bool([{should:credits}]));
					structure.query2.push(tools.wrap.constant_score(credits));
				}
				function pushtype(pos,q,options){
					var opt = {
						auto_generate_phrase_queries:true,
						default_operator:'AND',
					}
					Object.keys(options).forEach(function(key){opt[key] = options[key]})
					var queries = []
					var pos = 'query'+pos;
					q.forEach(function(query){
						var opt1={},opt2={},opt3={};
						Object.keys(opt).forEach(function(key){
							opt1[key] = opt[key];
							opt1.query = query;
							opt2[key] = opt[key];
							opt2.query = query;
							opt3[key] = opt[key];
							opt3.query = query;
						})
						opt1.default_field = "tracks.title";
						queries.push(tools.wrap.constant_score({query_string:opt1},{boost:5}));
						opt2.default_field = "tracks.title2";
						queries.push(tools.wrap.constant_score({query_string:opt2},{boost:5}));
						opt3.default_field = "metadata.title";
						queries.push(tools.wrap.constant_score({query_string:opt3},{boost:2}));
					})
					structure[pos].push(
						tools.wrap.bool([{should:queries}])
					)
				}

				if(track.classical.cat) pushtype(3,[track.classical.cat.id+'~ '+track.classical.cat.val,track.classical.cat.id+track.classical.cat.val+'~'],{phrase_slop:0});
				if(track.classical.key) pushtype(2,[track.classical.key.join(' ')],{phrase_slop:0});

				if(track.classical.op) {
					var cl = track.classical;
					var op = 'op~ '+cl.op[0];
					if(cl.op[1]) {
						var op1=op+' '+cl.op[1];
						var op2 = op+' '+tools.toroman(cl.op[1]);
						op = op1;
					}
					if(op2){
						pushtype(2,[op,op2],{phrase_slop:2})
					}else{
						pushtype(2,[op],{phrase_slop:2})
					}
				}

				if(track.classical.types) Object.keys(track.classical.types).forEach(function(key){
					var type = key+'~ '+track.classical.types[key];
					pushtype(2,[type],{phrase_slop:0});
				})
			}
		}
		if(track.metadata.artist && !track.classical && track.type!=='youtube'){
			structure.query2.push(tools.wrap.bool([{should:[
					tools.wrap.constant_score({match:{'tracks.artist.name':{query:artist}}}),
					tools.wrap.nested('tracks.artists',tools.wrap.constant_score({match:{'tracks.artists.name':{query:artist}}}))
			]}]))
		}
		if(!track.musicbrainz_id && (track.metadata.album && track.type !=='youtube' && !track.classical)){
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
				foo = tools.wrap.bool([{must:[{match:{'metadata.title':{query:track.metadata.album,type:'phrase'}}},foo]}]);
			}
			if(noAlbum.indexOf(track.metadata.album) === -1) structure.query4.push(foo);
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
		structure.query1 = [tools.wrap.nested('tracks',structure.query1,{inner_hits:{
			size:1
		}})];
		structure.query1 = tools.wrap.bool([{must:structure.query1.concat(structure.query4)},{should:structure.query5}]);

		var fs = tools.wrap.function_score({score_mode:'sum',boost_mode:'multiply'});
		fs = tools.wrap.function_score_add(fs,structure.filters);
		fs = tools.wrap.function_score_add(fs,structure.query1);
		var body = {index:db_index,type:'album',size:10,body:{_source:['metadata.title','id','youtube'],query:fs}};
		elastic.client.search(body,function(err,data){
			if(err){
				console.Yolk.error(err);
				console.Yolk.say(track);
				resolve('database error while looking for track in albums');
				busy = false;
			}

			if(data.hits && data.hits.hits.length){
				var albumtrack = data.hits.hits[0].inner_hits.tracks.hits.hits[0]._source;
				track.filter={};
				track.deleted = 'no';
				if(track.type!=='youtube'){
					var newalbum = tools.fix(data.hits.hits[0]._source.metadata.title);
					if(newalbum !== track.metadata.album){
						track.metadata.old_album2 = track.metadata.album;
						track.metadata.album = newalbum;
					}
					track.album=data.hits.hits[0]._source.id;

					// NEEDS TO BE TESTED
					if(data.hits.hits[0]._source.youtube === 'yes'){
						elastic.client.update({index:db_index,type:'album',id:track.album,refresh:true,body:{doc:{youtube:'no'}}},function(err,data){
							if(err) console.Yolk.error(err)
						})
					}
					//END NEEEDS TO BE TESTED
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
				if(albumtrack.disambig && !track.classical) track.disambig = track.disambig.concat(albumtrack.disambig)


				//first check for duplicate
				if(!self.dupe(track,true)){

					dupes.mbid.push({mbid:track.musicbrainz_id,auth:track.auth,type:track.type,id:track.id,rating:track.rating,downloads:track.downloads});
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
var buffer=[];
var bufferBusy=false;
musicbrainz.prototype.buffer = function(track){
	var self = this;
	if(track.musicbrainz_id){
		buffer.unshift(track)
	}else{
		buffer.push(track)
	}
	function commit(){
		if(buffer.length){
			bufferBusy=true;
			var Track = buffer.shift()
			self.add(Track);
			setTimeout(function(){
				commit()
			},10)
		}else{
			if(log) console.Yolk.error('BUFFER EMPTY')
			bufferBusy = false
		}
	}
	if(!bufferBusy) commit()
}
ipcMain.on('musicbrainz', function(event, track) {
	mbz.buffer(track)
})

ipcMain.on('musicbrainz_artist', function(event, artist) {
	mbq.ytartist.push(artist);
	mbz.pacer();
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
