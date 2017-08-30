'use strict'

/*
Copyright 2017 Michael Jonker (http://openpoint.ie)
This file is part of The Yolk.
The Yolk is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
any later version.
The Yolk is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.
You should have received a copy of the GNU General Public License
along with The Yolk.  If not, see <http://www.gnu.org/licenses/>.
*/

var changed = process.Yolk.modules.musicPlayer.config.progress;
const path = require('path');
const elastic = require(path.join(process.Yolk.root,'core/lib/elasticsearch.js'));
const db_index = process.Yolk.modules.musicPlayer.config.db_index.index;
const flow = require('./musicbrainzflow.js');
const tools = require('./searchtools.js');
const albums = require('../process/albums.js');
const meta = require('../process/meta.js');
var mbtools;

const cpu = require('../tools/cpu.js');
const message = process.Yolk.message;
const kill = require('./killer.js');
const log = false;
var mbdbase = function(){
	this.noAlbum = [];
	this.baddirs = {};
	this.bulk=[];
}
mbdbase.prototype.inject=function(type,f){
	if(type === 'mbtools') mbtools = f;
	//if(type === 'mbtools') mbtools = f;
}
mbdbase.prototype.getDupes=function(){
	var self = this;
	this.dupes = {mbid:[],album:[],artist:[],local:[],internetarchive:[],youtube:[],newalbums:[]};
	return new Promise(function(resolve,reject){
		var count = 0;
		elastic.fetchAll({index:db_index,type:'local,internetarchive,youtube',body:{query:{match:{musicbrainzed:{query:'yes',type:'phrase'}}},_source:['musicbrainz_id','id','type','fix','rating','downloads','file']}}).then(function(data){
			if(kill.kill) return;
			data.forEach(function(track){
				if(!track.file) console.Yolk.warn(file);
				if(!self.dupes[track.type]){self.dupes[track.type]=[]}
				self.dupes[track.type].push(track.id);
				if(track.musicbrainz_id){self.dupes.mbid.push({mbid:track.musicbrainz_id,auth:track.auth,type:track.type,id:track.id,rating:track.rating,downloads:track.downloads,file:track.file})}
			})
			count++;
			if(count === 2) resolve(true);
		},function(err){
			console.Yolk.error(err)
		})
		elastic.fetchAll({index:db_index,type:'album,artist',body:{query:{},_source:['id','name']}}).then(function(data){
			if(kill.kill) return;
			data.forEach(function(track){
				track.name?self.dupes.artist.push(track.id) : self.dupes.album.push(track.id)
			})
			count++;
			if(count === 2) resolve(true);
		},function(err){
			console.Yolk.error(err)
		})
	})
}


//attempt to find track details from an existing album
mbdbase.prototype.fromAlbum = function(track){
	//console.Yolk.warn('fromalbum')
	var self = this;
	var p = new Promise(function(resolve,reject){
		if(!track.musicbrainz_id && (!track.metadata.title || (!track.metadata.artist && !track.metadata.album))){resolve()};
		var body = populate(track,'dbase');
		elastic.client.search(body,function(err,data){
			kill.update('promises')
			if(kill.kill){
				resolve('kill');
				return;
			}
			if(err) resolve('database error while looking for track in albums');
			if(data.hits && data.hits.hits.length){
				track = newtrack(track,data);
				//first check for duplicate
				if(!mbtools.dupe(track,true)){
					self.dupes.mbid.push({mbid:track.musicbrainz_id,auth:track.auth,type:track.type,id:track.id,rating:track.rating,downloads:track.downloads,file:track.file});
					self.saveTrack(track)
					flow.add({type:'artist',id:track.artist,title:track.metadata.artist});
					reject(track);
				}else{
					resolve('track with that mbid already exists')
				}
			}else{
				resolve('no track found from albums');
			}
		})
	})
	kill.promises.push(p)
	return p;
}


mbdbase.prototype.getRelease = function(track){
	var self = this;
	//var body = populate(build(track,'release'),track,'release');
	var body = populate(track,'release');
	elastic.client.search(body,function(err,data){
		if(kill.kill) return;
		if(err){
			console.Yolk.error(err);
			console.Yolk.say(track);
			console.Yolk.say(body);
			flow.busy = false;
			return;
		}

		var hits = data.hits.hits.filter(function(album){
			if(album.inner_hits.tracks.hits.hits.length){return true}
		})
		var score = 0;
		if(track.musicbrainz_id) score = 0;
		if(hits.length && hits[0]._score > score){
			if(log) console.Yolk.say('Found a release')
			var highscore = hits[0]._score;
			hits = hits.filter(function(album){
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
			}
			var album = hits[0]
			if(log) console.Yolk.say('Filtered release to high score and oldest')
			var root = album.inner_hits.tracks.hits.hits[0]._source.tracks;
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
				mbdb.noAlbum.push(track.metadata.album);
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
			if(root.id) track.musicbrainz_id = root.id;
			if(log) console.Yolk.say('Saving album and re-submitting track : '+track.metadata.album+' - '+track.album);
			track.resub = true;
			if(track.rootdir && self.baddirs[track.rootdir] > 1) self.baddirs[track.rootdir] =1;
			flow.add(Album,track);
		}else{
			if(hits.length){
				var message = 'NO RELEASES | '+highscore+' | '+track.metadata.artist+' : '+track.metadata.album+' : '+track.metadata.title+' | '+track.musicbrainz_id;
			}else{
				var message = 'NO RELEASES | '+track.metadata.artist+' : '+track.metadata.album+' : '+track.metadata.title+' | '+track.musicbrainz_id;
			}
			if(log) console.Yolk.say(message);
			if(track.musicbrainz_id){
				track.auth=true;
			}
			if(track.rootdir){
				self.baddirs[track.rootdir]++;
			}
			track.deleted = 'yes';
			track.deleted_reason = message;
			self.saveTrack(track);
			flow.busy = false;
		}
	})
}
//save a track to the database
var busy = false;
mbdbase.prototype.saveTrack = function(track,timer){
    if(kill.kill){
		clearTimeout(this.savetimer);
        console.Yolk.error('KILL');
		return;
	}
	var self = this;
	if(track){
		track.date = Date.now();
		track.musicbrainzed ='yes';
		if(track.type === 'internetarchive'||track.type === 'youtube'){
			if(!track.file) console.Yolk.error(track);
			this.bulk.push({update:{ _index:db_index,_type:track.type+'search',_id:track.type === 'internetarchive'?track.id:track.file}});
			this.bulk.push({doc:{musicbrainzed:'yes'}});
		}
		this.bulk.push({update:{ _index:db_index,_type:track.type,_id:track.id}});
		this.bulk.push({doc:track,doc_as_upsert:true});
		if(track.artist && track.deleted === 'no'){
			this.bulk.push({update:{ _index:db_index,_type:'artist',_id:track.artist}});
			this.bulk.push({doc:{deleted:'no',bulk:'no'},doc_as_upsert:true});
		}
		if(track.album && track.deleted === 'no'){
			this.bulk.push({update:{ _index:db_index,_type:'album',_id:track.album}});
			this.bulk.push({doc:{deleted:'no',bulk:'no'}});
		}
	}
	if(this.savetimer)  return;

	if(cpu.load < 50 && !busy && this.bulk.length){
		busy = true;
		flow.busy = true;
		elastic.client.bulk({body:this.bulk,refresh:true},function(err,data){
			data.items.forEach(function(item){
				var type = item.update._type;
				var r = item.update.result;

				if(type==='artist' && r!=='noop'){
					changed.artist?changed.artist++:changed.artist = 1;
				}else if(type==='album' && r!=='noop'){
					changed.album?changed.album++:changed.album = 1;
				}else if(r!=='noop'){
					changed.title?changed.title++:changed.title = 1;
				}
			})
			if(kill.kill) return;
			if(err){
				console.Yolk.error(err);
				console.Yolk.say(self.bulk);
			}
			if(altered.album.length){
				albums.compress().then(function(changed){
					if(changed){
						self.getDupes().then(function(){
							busy = false;
							flow.busy = false;
						})
					}else{
						busy = false;
						flow.busy = false;
					}

				})
			}else{
				busy = false;
				flow.busy = false;
			}

			//message.send('refresh',altered)
			altered = {artist:[],album:[]}
		});
		this.bulk=[];
	}
	this.savetimer = setTimeout(function(){
		self.savetimer = false;
		if(kill.kill) return;
		self.saveTrack(false,true)
	},10000)
}

//format and save album or artist to the database
var altered = {artist:[],album:[]}
mbdbase.prototype.saveMeta = function(track,body){
	var self = this;
    var p = new Promise(function(resolve,reject){
    	var tosave = {links:{}}
    	var artwork = {
    		type:track.type,
    		id:body.id.toString()
    	};
    	if(body.relations.length){
    		body.relations.forEach(function(link){
    			if (link.type === 'discogs'){
    				artwork.discogs = link.url.resource+'/images';
					tosave.links.discogs = link.url.resource+'/images';
    			}
    			if(track.type === 'artist'){
    				artwork.images = [];
					tosave.links.images = [];
    				if(link.type === 'image'){
    					artwork.images.push(link.url.resource);
						tosave.links.images.push(link.url.resource);
    				}
    				if(link.type === 'official homepage'){
    					tosave.links.home = link.url.resource;
    				}
    				if(link.type === 'wikipedia'){
    					tosave.links.wikipedia = link.url.resource;
    				}
    			}
    		})
    	}

    	switch (track.type){
    		case 'artist':
    			tosave.country = body.country;
    			tosave.id = body.id.toString();
    			tosave.name = tools.fix(body.name);
				tosave.type='artist';
    			artwork.name = tools.fix(body.name);
    			save();
    		break;
    		case 'album':
				body.disambiguation ? tosave.disambig = [{dis:body.disambiguation}] : tosave.disambig=[];
				var p = tools.postfix(body.title).postfix;
				if(p) tosave.disambig.push({dis:p});

    			if(body['cover-art-archive'] && body['cover-art-archive'].front){
    				artwork.coverart = body['cover-art-archive'].front;
					tosave.links.coverart = body['cover-art-archive'].front;
    			};
                tosave.youtube = track.youtube ? 'yes':'no';
    			tosave.metadata={
    				title:tools.fix(body.title),
    				artist:tools.fix(body['artist-credit'][0].name)
    			}
    			artwork.artist = tools.fix(body['artist-credit'][0].name);
    			artwork.name = tools.fix(body.title);
    			tosave.id = body.id.toString();
    			if(body['release-group'] && body['release-group']['first-release-date']){
    				tosave.release_date = Number(new Date(body['release-group']['first-release-date']));
    			}
    			tosave.artist = body['artist-credit'][0].artist.id
    			tosave.tracks=[];
    			tosave.primary_type = body['release-group']['primary-type'] ? body['release-group']['primary-type'].toLowerCase():'unknown';
    			tosave.secondary_type = body['release-group']['secondary-type']&&body['release-group']['secondary-type'].length&&tosave.primary_type!=='unknown' ? body['release-group']['secondary-type'][0].toLowercase():'lp';
				tosave.status = body.status ? body.status.toLowerCase():'unknown'
				tosave.country = body.country;
				tosave.type='album';
				if(body.media && body.media[0] && body.media[0].format){
			        tosave.format = body.media[0].format.toLowerCase();
			    }else{
			        tosave.format = 'unknown'
			    }
				var count = 1;
    			if(body.media && body.media.length){
    				body.media.forEach(function(media){
    					//tosave.tracks['media-'+count]={};
    					var count2 = 1;
    					media.tracks.forEach(function(track,index){
    						var tr = {
                                id:track.recording.id.toString(),
    							disc:count,
    							position:count2,
    							id:track.recording.id.toString(),
                                dur:track.recording.length?Number(track.recording.length):0,
    							artist:{
    								name:tools.fix(track['artist-credit'][0].artist.name),
    								id:track['artist-credit'][0].artist.id.toString()
    							},
    							artists:[],
                                disambig:track.recording.disambiguation?[{dis:tools.fix(track.recording.disambiguation)}]:[],
								album:tosave.metadata.title
    						}
                            if(media.title){
                                tr.disambig.push({dis:media.title})
                            }
                            var title1 = tools.fix(track.title);
                            var title2 = tools.fix(track.recording.title);
                            var pf1 = tools.postfix(title1);
                            var pf2 = tools.postfix(title2);
                            var stopd = false;
                            if(pf1){
                                tr.disambig.forEach(function(dis){if(dis.dis === pf1.postfix) stopd=true})
                                if(!stopd){tr.disambig.push({dis:pf1.postfix})};
                            }
                            if(pf2 && pf2.postfix!==pf1.postfix){
                                stopd = false;
                                tr.disambig.forEach(function(dis){if(dis.dis === pf2.postfix) stopd=true})
                                if(!stopd){tr.disambig.push({dis:pf2.postfix})};
                            }

                            if(title1!==title2){
                                tr.title = title2;
                                tr.title2 = title1;
                            }else{
                                tr.title = title1;
                            }
                            track.recording['artist-credit'].concat(track['artist-credit']).forEach(function(artist){
                                var stop = false;
                                tr.artists.forEach(function(ar){if(ar.id === artist.artist.id || ar.id === tr.artist.id) stop = true})
                                if(!stop){
                                    tr.artists.push({
                                        name:tools.fix(artist.artist.name),
                                        id:artist.artist.id
                                    })
                                }
                            })
                            tosave.tracks.push(tr);
    						count2++;
    					})
    					count++;
    				})
    			}
                save();
                return;
    		break;
    	}


    	function save(){
    		tosave.date = Date.now();
    		tosave.deleted = 'no';
    		var create = {
    			index:db_index,
    			type:track.type,
    			id:body.id,
    			refresh:true,
				doc_as_upsert:true,
    			body:{doc:tosave}
    		}
            elastic.client.update(create,function(err,data){
				kill.update('promises');
				if(kill.kill) return;
                if(err){
                    reject(err);
                }else{
                    if(!track.youtube){
                        meta.add(artwork);
                    }
					altered[tosave.type].push(tosave.id);
					changed[tosave.type]?changed[tosave.type]++:changed[tosave.type]=1;
                    resolve('SAVED ------------- '+tosave.id);
                }
            })
    	}
    })
	kill.promises.push(p);
	return p;
}
var populate = function(track,type){
	var structure = {
		query1:[/*initial "should" inside of nested "must"*/],
		query2:[/*additional queries inside of nested "must"*/],
		query3:[/*queries inside of nested "should"*/],
		query4:[/*additional queries inside of outer "must"*/],
		query5:[/*queries inside of outer "should"*/],
	}


	if(track.type==='youtube'){
		structure.query2.push({query_string:{
			fields:['tracks.title','tracks.title2'],
			query:track.dbquery,
		}})


		//structure.query1.push({match:{'tracks.title':{query:track.metadata.title,boost:2}}})
		//structure.query1.push({match:{'tracks.title2':{query:track.metadata.title,boost:2}}})
		if(track.artists){
			var arts=[]
			track.artists.forEach(function(artist){
				arts.push({match:{"tracks.artist.name":{query:artist.name,type:'phrase'}}})
			})
			structure.query2.push(tools.wrap.bool([{should:arts}]))
		}else{
			structure.query2.push({match:{"tracks.artist.name":{query:track.metadata.artist,type:'phrase'}}})
		}
		return wrap(structure,type);
	}


	structure.query5.push({match:{format:{query:'cd',type:'phrase',boost:4}}});
	structure.query5.push({match:{format:{query:'vinyl',type:'phrase',boost:5}}});
	structure.query5.push({match:{country:{query:'US',type:'phrase',boost:4}}});
	structure.query5.push({match:{country:{query:'GB',type:'phrase',boost:5}}});
	structure.query5.push({match:{primary_type:{query:'album',type:'phrase',boost:5}}});
	structure.query5.push({match:{secondary_type:{query:'lp',type:'phrase',boost:5}}});
	structure.query5.push({match:{status:{query:'official',type:'phrase',boost:5}}});
	//structure.query5.push({match:{artwork:{query:true,boost:5}}});

	if(track.classical){
		structure.query2.push(
			{query_string:{
				fields:['tracks.title','tracks.title2'],
				query:track.classical.query,
				boost:100
			}}
		)
		return wrap(structure,type);
	}
	if(track.musicbrainz_id){
		structure.query2.push({match:{'tracks.id.exact':{query:track.musicbrainz_id}}})
		return wrap(structure,type);
	}


	var title = tools.postfix(track.metadata.title);
	if(!title) title = {prefix:track.metadata.title};

	structure.query1.push({match:{'tracks.title':{query:title.prefix,type:'phrase',boost:50}}});
	structure.query1.push({match:{'tracks.title.exact':{query:track.metadata.title,boost:100}}});
	structure.query1.push({match:{'tracks.title2':{query:title.prefix,type:'phrase',boost:50}}});
	structure.query1.push({match:{'tracks.title2.exact':{query:track.metadata.title,boost:100}}});
	structure.query1.push({match:{'tracks.title':{query:track.metadata.title,fuzziness:'auto',operator:'and'}}});
	structure.query1.push({match:{'tracks.title2':{query:track.metadata.title,fuzziness:'auto',operator:'and'}}});
	if(title.postfix){
		structure.query3.push(tools.wrap.nested('disambig',{match:{dis:{query:title.postfix,type:'phrase'}}},{boost:20}));
	}
	if(track.metadata.album){
		var album = tools.postfix(track.metadata.album);
		if(!album) album = {prefix:track.metadata.album};

		if(type === 'release') structure.query5.push({match:{'album':{query:album.prefix,type:'phrase',boost:100}}});
		if(type === 'dbase') structure.query5.push({match:{'metadata.title':{query:album.prefix,type:'phrase',boost:100}}});
		if(album.postfix){
			structure.query5.push(tools.wrap.nested('disambig',{match:{dis:{query:album.postfix,type:'phrase'}}},{boost:20}));
		}
	}
	if(track.type === 'youtube'){
		structure.query1.push({match:{'tracks.title':{query:track.metadata.title,minimum_should_match:3}}})
		structure.query1.push({match:{'tracks.title2':{query:track.metadata.title,minimum_should_match:3}}})
	}
	var aname = track.metadata.artist;
	var artists=track.metadata.artist.split(/\,| \& | feat | feat\. | featuring | with | and /g).map(function(name){return name.trim()});
	if(track.artists) artists = artists.concat(track.artists);
	var art = [{match:{'tracks.artist.name':{query:aname,type:'phrase'}}}]
	if(artists.length > 1) artists.forEach(function(a){
		art.push({match:{'tracks.artist.name':{query:a,type:'phrase'}}})
	})
	structure.query2.push(tools.wrap.bool([{should:art}]));
	return wrap(structure,type);
}
var wrap = function(structure,type){
	structure.query1 = [tools.wrap.bool([{should:structure.query1}])];
	structure.query1 = tools.wrap.bool([{must:structure.query1.concat(structure.query2)},{should:structure.query3}]);
	if(type === 'dbase') structure.query1 = [tools.wrap.nested('tracks',structure.query1,{inner_hits:{
		size:1
	}})];
	if(type === 'release') structure.query1 = [tools.wrap.nested('tracks',structure.query1,{inner_hits:{
		_source:{includes:['tracks.title','tracks.artist.name','tracks.length','tracks.id']}
	}})];
	structure.query1 = tools.wrap.bool([{must:structure.query1.concat(structure.query4)},{should:structure.query5}]);

	//var fs = tools.wrap.function_score({score_mode:'sum',boost_mode:'multiply'});
	//fs = tools.wrap.function_score_add(fs,structure.filters);
	//fs = tools.wrap.function_score_add(fs,structure.query1);
	if(type === 'dbase') var body = {index:db_index,type:'album',size:10,body:{_source:['metadata.title','id','youtube'],query:structure.query1}};
	if(type === 'release') var body = {index:db_index,type:'release',size:100,body:{_source:['album','date','id'],query:structure.query1}};
	return body;
}
var newtrack=function(track,data){
	var albumtrack = data.hits.hits[0].inner_hits.tracks.hits.hits[0]._source;
	//console.Yolk.warn(track.metadata.title)
	//console.Yolk.say(albumtrack)

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

	track.musicbrainz_id = albumtrack.id.toString();
	track.artist=albumtrack.artist.id.toString();
	if(albumtrack.disambig && !track.classical){
		if(!track.disambig) track.disambig = [];
		track.disambig = track.disambig.concat(albumtrack.disambig);
	}
	return track;
}

const mbdb = new mbdbase()
module.exports = mbdb;
