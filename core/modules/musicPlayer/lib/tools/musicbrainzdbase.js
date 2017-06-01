'use strict'

const elastic = process.Yolk.db;
const db_index = process.Yolk.modules.musicPlayer.config.db_index.index;
const q = Promise;
const request = require('request');
const tools = require('./searchtools.js');
const mbtools = require('./musicbrainztools');
const headers = process.Yolk.modules["musicPlayer"].config.headers;
const log = true;
var mbdbase = function(){
	//this.getDupes();
	this.noAlbum = [];
}

mbdbase.prototype.getDupes=function(){
	var self = this;
	this.dupes = {mbid:[],album:[],artist:[],local:[],internetarchive:[],youtube:[],newalbums:[]};
	return new q(function(resolve,reject){
		var count = 0;
		elastic.fetchAll({index:db_index,type:'local,internetarchive,youtube',body:{query:{match:{musicbrainzed:{query:'yes',type:'phrase'}}},_source:['musicbrainz_id','id','type','fix']}}).then(function(data){
			data.forEach(function(track){
				if(!self.dupes[track.type]){self.dupes[track.type]=[]}
				self.dupes[track.type].push(track.id);
				if(track.musicbrainz_id){self.dupes.mbid.push({mbid:track.musicbrainz_id,auth:track.auth,type:track.type,id:track.id,rating:track.rating,downloads:track.downloads})}
			})
			count++;
			if(count === 2) resolve(true);
		},function(err){
			console.Yolk.error(err)
		})
		elastic.fetchAll({index:db_index,type:'album,artist',body:{query:{},_source:['id','name']}}).then(function(data){
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
//"delete" the old track
mbdbase.prototype.remove=function(dupe){
	elastic.client.update({index:db_index,type:dupe.type,id:dupe.id,body:{doc:{deleted:'yes',deleted_reason:'Found duplicate mbid'},doc_as_upsert:true},refresh:true})
}
//check for duplicates
mbdbase.prototype.dupe = function(track,skip){
	var self = this;
	if(this.dupes[track.type].indexOf(track.id) > -1 && !skip){return true;}
	if(!skip) this.dupes[track.type].push(track.id);
	if(this.dupes.mbid.some(function(dupe){

			if(dupe.mbid === track.musicbrainz_id){
				//console.Yolk.error(track.downloads*1+' > '+dupe.downloads*1+' : '+(track.downloads*1 > dupe.downloads*1))
				if(dupe.type === track.type && dupe.auth){return true}else
				if(dupe.type === track.type && (track.musicbrainz_id||track.auth)){self.remove(dupe);return false;}else
				if(dupe.type === track.type && track.type==='youtube' && track.rating*1 > dupe.rating*1){

					self.remove(dupe);
					return false;
				}else
				if(dupe.type === track.type && track.type==='internetarchive' && track.downloads*1 > dupe.downloads*1){
					//console.Yolk.error(track)
					self.remove(dupe);
					return false;
				}else
				if(dupe.type === track.type){return true}else
				if(dupe.type === 'local'||track.type === 'youtube'){
					if(track.type === 'youtube'){return false}
					return true;
				}else
				if(dupe.type !== 'local' && dupe.type !== 'youtube' && track.type === 'local'){
					self.remove(dupe);
					return false;
				}else{return true}
			}else{return false}
		})
	){return true}else{return false}
}

//attempt to find track details from an existing album
mbdbase.prototype.fromAlbum = function(track){
	//console.Yolk.warn('fromalbum')
	var self = this;
	return new q(function(resolve,reject){
		if(!track.musicbrainz_id && (!track.metadata.title || (!track.metadata.artist && !track.metadata.album))){resolve()};

		//var body = populate(build(track,'dbase'),track,'dbase');
		var body = populate(track,'dbase');

		elastic.client.search(body,function(err,data){
			if(self.flow.kill){
				resolve('kill');
				return;
			}
			if(err) resolve('database error while looking for track in albums');
			if(data.hits && data.hits.hits.length){
				track = newtrack(track,data);
				//first check for duplicate
				if(!self.dupe(track,true)){
					self.dupes.mbid.push({mbid:track.musicbrainz_id,auth:track.auth,type:track.type,id:track.id,rating:track.rating,downloads:track.downloads});
					mbtools.saveTrack(track)
					self.flow.add({type:'artist',id:track.artist,title:track.metadata.artist});
					reject(track);
				}else{
					resolve('track with that mbid already exists')
				}
			}else{
				resolve('no track found from albums');
			}
		})
	})
}

//submit item to Musicbrainz server
mbdbase.prototype.go = function(track){
	var self = this;
	var options={headers:headers,url:track.query};
	if(track.type !== 'artist'&& track.type !== 'album' && !track.timedout) options.timeout = 10000;
	if(log) console.Yolk.say('Submitting request to MusicBrainz server - Timeout: '+options.timeout||'none');


	request.get(options,function(error, response, body){
		if(self.flow.kill){return;}
		if (!error && response.statusCode == 200) {
			if(log) console.Yolk.say('Got response from MusicBrainz');
			try{
				var tt = JSON.parse(body);
			}
			catch(err){
				var tt=false;
				console.Yolk.error(err);
				self.flow.busy = false;
				return;
			}
			if(track.musicbrainz_id){
				track.metadata.artist = tools.fix(tt['artist-credit'][0].artist.name);
				track.metadata.title = tools.fix(tt.title);
				if(track.musicbrainz_id !== tt.id){
					console.Yolk.warn(track.musicbrainz_id);
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
				mbtools.saveMeta(track,tt).then(function(message){
					self.flow.busy = false;
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
			if(mbtools.newrels.length){
				mbtools.newrels.forEach(function(release){
					releases.push({update:{_index:db_index,_type:'release',_id:release.id}});
					releases.push({doc:release,doc_as_upsert:true});
				})
				mbtools.newrels=[];
			}
			//return if no releases were found for track
			if(!releases.length){
				if(log) console.Yolk.warn('No releases found for '+track.metadata.artist+' : '+track.metadata.album+' : '+track.metadata.title);
				if(log) console.Yolk.say(track.query)
				track.deleted = 'yes'
				track.deleted_reason = 'no releases found for track';
				mbtools.saveTrack(track);
				self.flow.busy = false;
				return
			}
			if(log) console.Yolk.say('Saving '+((releases.length)/2)+' releases to db');
			if(log && releases.length > 1000) console.Yolk.warn(track.query);

			//First save the found releases to database
			elastic.client.bulk({body:releases,refresh:true},function(err,data){
				if(err){
					console.Yolk.error(err);
					self.go(track);
				}else{
					if(log) console.Yolk.say('Quering db for best release');
					//then query the releases for best candidate
					elastic.client.search({index:db_index,type:'release',body:{query:{match_all:{}}},size:1000},function(err,data){
						console.Yolk.warn(data)
						self.getRelease(track);
					})

				}
			})
		}else{
			!track.retry ? track.retry = 1 : track.retry++;

			var types = {youtube:'youtube',artist:'artist',local:'other',internetarchive:'other',album:'album'};
			if(response){
				if(log) console.Yolk.warn('Error in musicbrainz lookup: '+response.statusCode+' : '+track.retry)
				if((response.statusCode === 503 || response.statusCode === 500) && !self.flow.kill){
					setTimeout(function(){
						self.go(track)
					},self.pace)
				}else{
					self.flow.busy = false;
				}
			}else{
				if(log) console.Yolk.error(error.message);
				if(log) console.Yolk.say(track.query)
				if(error.message.indexOf('TIMEDOUT') > -1){
					if(track.retry > 2) track.timedout = true;
					delete track.toalbum;
					self.flow.mbq[types[track.type]].push(track);
				}
				self.flow.busy = false;
			}
		}
	})
}
mbdbase.prototype.getRelease = function(track){
	var self = this;
	//var body = populate(build(track,'release'),track,'release');
	var body = populate(track,'release');
	elastic.client.search(body,function(err,data){
		if(err){
			console.Yolk.error(err);
			console.Yolk.say(track)
			self.flow.busy = false;
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
			track.musicbrainz_id = album.inner_hits.tracks.hits.hits[0]._source.id;
			if(log) console.Yolk.say('Saving album and re-submitting track : '+track.metadata.album+' - '+track.album)
			track.resub = true;
			self.flow.add(Album,track);
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
			track.deleted = 'yes';
			track.deleted_reason = message;
			mbtools.saveTrack(track);
			self.flow.busy = false;
		}
	})
}
var build = function(track,type){

	var foo = {
		query1:[/*initial "should" inside of nested "must"*/],
		query2:[/*additional queries inside of nested "must"*/],
		query3:[/*queries inside of nested "should"*/],
		query4:[/*additional queries inside of outer "must"*/],
		query5:[/*queries inside of outer "should"*/],
	}

	if(type === 'dbase') foo.filters = [
		tools.wrap.filter({match:{primary_type:{query:'album'}}},{weight:5}),
		tools.wrap.filter({match:{secondary_type:{query:'lp'}}},{weight:10}),
		tools.wrap.filter({match:{secondary_type:{query:'single'}}},{weight:4}),
		tools.wrap.filter({match:{secondary_type:{query:'compilation'}}},{weight:3}),
		tools.wrap.filter({match:{secondary_type:{query:'live'}}},{weight:2}),
		tools.wrap.filter({match:{country:{query:'US',type:'phrase'}}},{weight:2}),
		tools.wrap.filter({match:{country:{query:'GB',type:'phrase'}}},{weight:5}),

		/*
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
		*/
	];
	if(type === 'release') foo.filters = [
		tools.wrap.filter({match:{"type.exact":{query:'album',type:'phrase'}}},{weight:5}),
		tools.wrap.filter({match:{"status.exact":{query:'official',type:'phrase'}}},{weight:5}),
		tools.wrap.filter({match:{"type2.exact":{query:'lp'}}},{weight:10}),
		tools.wrap.filter(tools.wrap.bool([{must:[
			{match:{"type.exact":{query:'album',type:'phrase'}}},
			{match:{"status.exact":{query:'official',type:'phrase'}}},
			{match:{"type2.exact":{query:'lp',type:'phrase'}}}
		]}]),{weight:20}),
		tools.wrap.filter({match:{"type2.exact":{query:'single',type:'phrase'}}},{weight:2}),
		tools.wrap.filter({match:{"type2.exact":{query:'soundtrack',type:'phrase'}}},{weight:3}),
		tools.wrap.filter({match:{"type2.exact":{query:'compilation',type:'phrase'}}},{weight:3}),
		tools.wrap.filter({match:{"type2.exact":{query:'live',type:'phrase'}}},{weight:2}),
		tools.wrap.filter({match:{country:{query:'US',type:'phrase'}}},{weight:2}),
		tools.wrap.filter({match:{country:{query:'GB',type:'phrase'}}},{weight:5}),
		tools.wrap.filter({match:{format:{query:'vinyl',fuzziness:'auto'}}},{weight:8}),
		tools.wrap.filter({match:{format:{query:'cd',type:'phrase'}}},{weight:4}),
	];
	return foo;
}
var populate = function(track,type){
	var structure = {
		query1:[/*initial "should" inside of nested "must"*/],
		query2:[/*additional queries inside of nested "must"*/],
		query3:[/*queries inside of nested "should"*/],
		query4:[/*additional queries inside of outer "must"*/],
		query5:[/*queries inside of outer "should"*/],
	}

	structure.query5.push({match:{format:{query:'cd',type:'phrase',boost:2}}});
	structure.query5.push({match:{format:{query:'vinyl',type:'phrase',boost:5}}});
	structure.query5.push({match:{country:{query:'US',type:'phrase',boost:2}}});
	structure.query5.push({match:{country:{query:'GB',type:'phrase',boost:5}}});
	structure.query5.push({match:{primary_type:{query:'album',type:'phrase',boost:5}}});
	structure.query5.push({match:{secondary_type:{query:'lp',type:'phrase',boost:5}}});
	structure.query5.push({match:{status:{query:'official',type:'phrase',boost:5}}});
	structure.query5.push({match:{artwork:{query:true,boost:5}}});


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
		structure.query3.push(tools.wrap.nested('disambig',{match:{dis:{query:title.postfix,type:'phrase'}}},{boost:100}));
	}
	if(track.metadata.album){
		if(type === 'release') structure.query5.push({match:{'album':{query:track.metadata.album,type:'phrase',boost:100}}});
		if(type === 'dbase') structure.query5.push({match:{'metadata.title':{query:track.metadata.album,type:'phrase',boost:100}}});
	}

	var artists=track.metadata.artist.split(/\,| \& | feat | feat\. | featuring | with | and /g).map(function(name){return name.trim()});
	var art = [{match:{'tracks.artist.name':{query:track.metadata.artist,type:'phrase'}}}]
	if(artists.length > 1) artists.forEach(function(a){
		art.push({match:{'tracks.artist.name':{query:a,type:'phrase'}}})
	})
	structure.query2.push(tools.wrap.bool([{should:art}]));

	return wrap(structure,type);

	//structure.query1.push(tools.wrap.constant_score({match:{'tracks.title2':{query:title.prefix}}},{boost:50}));
	//console.Yolk.log(structure.query1)

	//structure.query2.push({match:{'tracks.artist.name':{query:track.metadata.artist,type:'phrase',fuzziness:'auto'}}})

	//if(track.metadata.album && type==='release') structure.query4.push({match:{'album':{query:track.metadata.album,type:'phrase',fuzziness:'auto'}}})
	//if(track.metadata.album && type==='dbase') structure.query4.push({match:{'metadata.title':{query:track.metadata.album,type:'phrase',fuzziness:'auto'}}})



	if(type === 'dbase'){
		var artist;
		(track.classical && track.classical.composer) ? artist=track.classical.composer : artist = track.metadata.artist;
	}
	var postfix = tools.postfix(track.metadata.title);
	if(postfix){
		structure.query3.push(tools.wrap.constant_score(
			tools.wrap.nested('tracks.disambig',{match:{"tracks.disambig.dis":{query:postfix.postfix,type:'phrase',slop:2}}})
		,{boost:100}));
		if(type === 'dbase'){
			structure.query3.push(tools.wrap.constant_score({match:{"tracks.title":{query:postfix.postfix,type:'phrase'}}},{boost:2}))
			structure.query3.push(tools.wrap.constant_score({match:{"tracks.title2":{query:postfix.postfix,type:'phrase'}}},{boost:2}))
		}
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
		if(type === 'dbase') structure.query2.push(tools.wrap.bool([{should:[
				tools.wrap.constant_score({match:{'tracks.artist.name':{query:artist}}}),
				tools.wrap.nested('tracks.artists',tools.wrap.constant_score({match:{'tracks.artists.name':{query:artist}}}))
		]}]))
		if(type === 'release') structure.query2.push(tools.wrap.bool([{should:[
				tools.wrap.constant_score({match:{'tracks.artist.name':{query:track.metadata.artist}}}),
		]}]))
	}
	if(type ==='dbase' && !track.musicbrainz_id && (track.metadata.album && track.type !=='youtube' && !track.classical)){
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
		if(mbdb.noAlbum.indexOf(track.metadata.album) === -1) structure.query4.push(foo);
	}
	if(type === 'release' && track.metadata.album && track.type !=='youtube' && !track.classical){
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
		structure.query2.push(tools.wrap.constant_score({match:{'tracks.id.exact':{query:track.musicbrainz_id,type:'phrase'}}}))
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
	if(albumtrack.disambig && !track.classical) track.disambig = track.disambig.concat(albumtrack.disambig);
	return track;
}
const mbdb = new mbdbase()
module.exports = mbdb;
