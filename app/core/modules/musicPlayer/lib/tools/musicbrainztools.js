"use strict";

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

const {ipcMain} = require('electron');
const tools = require('./searchtools.js');
const path = require('path');
const elastic = require(path.join(process.Yolk.root,'core/lib/elasticsearch.js'));
const db_index = process.Yolk.modules.musicPlayer.config.db_index.index;
const request = require('request');
const headers = process.Yolk.modules["musicPlayer"].config.headers;
const flow = require('./musicbrainzflow.js');
var mbdb;
const message = process.Yolk.message;
const kill = require('./killer.js');

const log = false;

var mbtools = function(){
    this.preferred_release = 'GB';
	this.newrels=[];
};
mbtools.prototype.inject=function(type,f){
	if(type === 'mbdb') mbdb = f;
	//if(type === 'mbtools') mbtools = f;
}
//"delete" the old track
mbtools.prototype.remove=function(track){
	track.deleted='yes';
	track.deleted_reason = 'Found duplicate MBID';
	mbdb.saveTrack(track);
}
//check for duplicates
mbtools.prototype.dupe = function(track,skip){
	var self = this;

	if(!skip){
		if((track.type==='artist' || track.type === 'album') && mbdb.dupes[track.type].indexOf(track.id) > -1){return true}
		mbdb.dupes[track.type].push(track.id);
	}
	if(!track.musicbrainz_id) return false;
	if(mbdb.dupes.mbid.some(function(dupe){
			if(dupe.mbid === track.musicbrainz_id && dupe.id!==track.id){
				//console.Yolk.error(track.downloads*1+' > '+dupe.downloads*1+' : '+(track.downloads*1 > dupe.downloads*1))
				if(dupe.type === track.type && dupe.auth){return true}else
				if(dupe.type === track.type && track.auth){self.remove(dupe);return false;}else
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
	})){return true}else{return false}
}
//process recording releases into array for bulk submission
mbtools.prototype.doRelease = function(recording){

    var self = this;
    var releases = [];
    recording.releases.forEach(function(release){
        if(!release.media){
            console.Yolk.error(release);
            return;
        };
        var Recording = self.recording(recording);
        var release = self.release(Recording,release);
    })
}

//process a recording from musicbrainz into a database compatible format
mbtools.prototype.recording = function(recording){
    if(recording['artist-credit'] && recording['artist-credit'][0]){
        var artist = tools.fix(recording['artist-credit'][0].artist.name);
        var artists = recording['artist-credit'].map(function(artist){
            return {
                name:artist.name||artist.artist.name,
                id:artist.artist.id
            }
        })
    }else{
        var artists = false;
        var artist=false;
    }
    return {
        artists:artists,
        artist:artist?artist : 'unknown-artist',
        title:tools.fix(recording.title),
        disambig:recording.disambiguation?[{dis:tools.fix(recording.disambiguation)}] : [],
        id:recording.id
    };
}

//process a release from musicbrainz into a database compatible format
mbtools.prototype.release = function(recording,release){

	var p = tools.postfix(release.title).postfix;
	if(p) release.disambig = [{dis:p}];

	var self = this;

	//format the release track and add artist credit to it
	var title1=tools.fix(release.media[0].track[0].title);
	var title2=tools.fix(recording.title);
	var disambig = recording.disambig;
	var pf1 = tools.postfix(title1);
	var pf2 = tools.postfix(title2);
	var stopd = false;
	if(pf1){
		disambig.forEach(function(dis){if(dis.dis === pf1.postfix) stopd=true})
		if(!stopd){disambig.push({dis:pf1.postfix})};
	}
	if(pf2 && pf2.postfix!==pf1.postfix){
		stopd=false;
		disambig.forEach(function(dis){if(dis.dis === pf2.postfix) stopd=true})
		if(!stopd){disambig.push({dis:pf2.postfix})};
	}
	if(release.media && release.media.length && release.media[0].track && release.media[0].track.length && release.media[0].track[0]['artist-credit']){
		var artist = release.media[0].track[0]['artist-credit'][0].artist
	}else if(recording.artists && recording.artists.length && recording.artists[0].name === recording.artist){
		var artist = recording.artists[0]
	}else{
		var artist = {name:recording.artist,id:false}
	}
	var track = {
		title:title1,
		artist:{name:artist.name,id:artist.id},
		artists:recording.artists,
		id:recording.id,
		album:tools.fix(release.title)
	}
	if(title1!==title2){
		track.title = title2;
		track.title2=title1;
	}
	track.disambig = disambig.length?disambig : [];
	if(release.media[0].track[0].length) track.length = Number(release.media[0].track[0].length);

	if(this.newrels.some(function(rel,index){
		if(rel.id === release.id){
			self.newrels[index].tracks.push(track);
			return true;
		}
	})){return}

    //label releases with an unknown artist credit
    if(!release['artist-credit']){
        release['artist-credit']=[{artist:{name:'unknown-credit'}}];
    }
    //label the release format
    if(release.media && release.media[0] && release.media[0].format){
        var format = release.media[0].format.toLowerCase();
    }else{
        var format = 'unknown'
    }

    //label the release types
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
        id:release.id,
        country:release.country,
        date:release.date ? Number(new Date(release.date)):0,
		disambig:release.disambig||[],
        format:format,
        album:tools.fix(release.title),
        artist:release['artist-credit'][0].artist.name,
        status:release.status ? release.status.toLowerCase():'unknown',
        type:type,
        type2:type2,
		tracks:[track]
    };
    this.newrels.push(Release)
}
//submit item to Musicbrainz server
mbtools.prototype.go = function(track){
	var self = this;
	var options={headers:headers,url:track.query};
	if(track.type !== 'artist'&& track.type !== 'album' && !track.timedout) options.timeout = 10000;
	if(log) console.Yolk.say('Submitting request to MusicBrainz server - Timeout: '+options.timeout||'none');


	var r = request.get(options,function(error, response, body){
		if(flow.kill){return}
		kill.update('requests')
		if (!error && response.statusCode == 200) {
			if(log) console.Yolk.say('Got response from MusicBrainz');
			try{
				var tt = JSON.parse(body);
			}
			catch(err){
				var tt=false;
				console.Yolk.error(err);
				flow.busy = false;
				return;
			}
			if(track.musicbrainz_id){
				track.metadata.artist = tools.fix(tt['artist-credit'][0].artist.name);
				track.metadata.title = tools.fix(tt.title);
				if(track.musicbrainz_id !== tt.id){
					track.old_musicbrainz_id = track.musicbrainz_id;
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
				mbdb.saveMeta(track,tt).then(function(message){
					flow.busy = false;
					if(log) console.Yolk.say(message);
				});
				return;
			}
			//got from a query search
			if(tt.recordings && tt.recordings.length){
				tt.recordings.forEach(function(recording){
					if(recording.releases && recording.releases.length){
						self.doRelease(recording);
					}
				})

			//got from a mbid lookup
			}else if(tt.releases && tt.releases.length){
				tt.releases.forEach(function(release){
					release.media[0].track = release.media[0].tracks
				})
				self.doRelease(tt);
			}
			var releases = []
			if(self.newrels.length){
				self.newrels.forEach(function(release){
					releases.push({update:{_index:db_index,_type:'release',_id:release.id}});
					releases.push({doc:release,doc_as_upsert:true});
				})
				self.newrels=[];
			}
			//return if no releases were found for track
			if(!releases.length){
				if(log) console.Yolk.warn('No releases found for '+track.metadata.artist+' : '+track.metadata.album+' : '+track.metadata.title);
				if(log) console.Yolk.say(track.query)
				track.deleted = 'yes'
				track.deleted_reason = 'no releases found for track';
				mbdb.saveTrack(track);
				flow.busy = false;
				return
			}
			if(log) console.Yolk.say('Saving '+((releases.length)/2)+' releases to db');
			if(log && releases.length > 1000) console.Yolk.warn(track.query);

			//First save the found releases to database
			elastic.client.bulk({body:releases,refresh:true},function(err,data){
				if(kill.kill) return;
				if(err){
					console.Yolk.error(err);
					self.go(track);
				}else{
					if(log) console.Yolk.say('Quering db for best release');
					mbdb.getRelease(track);
				}
			})
		}else{
			!track.retry ? track.retry = 1 : track.retry++;

			var types = {youtube:'youtube',artist:'artist',local:'other',internetarchive:'other',album:'album'};
			if(response){
				if(log) console.Yolk.warn('Error in musicbrainz lookup: '+response.statusCode+' : '+track.retry)
				if((response.statusCode === 503 || response.statusCode === 500) && !flow.kill){
					setTimeout(function(){
						if(kill.kill) return;
						self.go(track)
					},self.pace)
				}else{
					flow.busy = false;
				}
			}else{
				if(log) console.Yolk.error(error.message);
				if(log) console.Yolk.say(track.query)
				if(error.message.indexOf('TIMEDOUT') > -1){
					if(track.retry > 2) track.timedout = true;
					delete track.toalbum;
					flow.mbq[types[track.type]].push(track);
				}
				flow.busy = false;
			}
		}
	})
	kill.requests.push(r)
}
//construct query strings for API lookups
mbtools.prototype.musicbrainz = function(info){
	var self = this;

	//strip leading track number from track title
	if(info.metadata.title && Number(info.metadata.title.split(' ')[0].replace('.',''))>=0){
		var title = info.metadata.title.split(' ');
		title.shift();
		info.metadata.title = title.join(' ');
	}
	if(info.musicbrainz_id){
		var query = 'http://musicbrainz.org/ws/2/recording/'+info.musicbrainz_id+'?'+'&inc=artists+artist-rels+releases+release-groups+release-rels+release-group-rels+media&fmt=json';
		info.query = query
	}else if(info.classical){
        if(info.duration){
            var bottom = (Math.floor(info.duration/1000)*1000)-600;
            var top = (Math.ceil(info.duration/1000)*1000)+600;
            var duration='['+bottom+' TO '+top+']'
        }
		var cl = info.classical;
		var md = info.metadata;
		var artistname = '"'+tools.queryBuilder(cl.composer)+'"';
		var fartistname = tools.queryBuilder(cl.composer);
		if(cl.artist && cl.artist.length){
			artistname = '('+artistname
			fartistname = '(('+fartistname+')'
			var creditname = 'creditname:('
			cl.artist.forEach(function(artist,index){
				artistname += ' OR "'+tools.queryBuilder(artist.name)+'"';
				fartistname += ' OR ('+tools.queryBuilder(artist.name)+')';
            	var foo = '('+tools.queryBuilder(artist.name)+')'
            	if(!index) creditname+=foo;
				if(index) creditname+=' OR '+foo;
        	});
			artistname+=')';
			fartistname+=')';
			creditname+=')^1000';
		}else{
			fartistname = '('+fartistname+')';
		}

		var recording = tools.queryBuilder(md.title);
		var release = tools.queryBuilder(md.album);

        if (cl.cat||cl.op){
			var qq ='('+recording+')'
			recording ='(('+recording+')'

			if(cl.cat){
				var cat = '"'+cl.cat.id+'"';
				recording +=' AND ("'+cl.cat.val+'" OR "'+cl.cat.id+cl.cat.val+'")';
				qq+=' AND (("'+cl.cat.val+'" OR "'+cl.cat.id+cl.cat.val+'") OR tracks.album:("'+cl.cat.val+'" OR "'+cl.cat.id+cl.cat.val+'"))';
			}
			if(cl.op){
				recording+=' AND "op~ '+cl.op.join(' ')+'"~1'
				qq+=' AND ("op~ '+cl.op.join(' ')+'"~1 OR tracks.album:"op~ '+cl.op.join(' ')+'"~1)';
			}
			recording+=')'
		}else{
			recording = '('+recording+')^100'
			var qq = '('+recording+')^100'
		}

        if(cl.key) var key = 'recording:"*'+cl.key.join(' ')+'*"';
        if(cl.types){
            var types = []
            Object.keys(cl.types).forEach(function(type){
                var type = tools.queryBuilder(type+' '+cl.types[type],{fuzzy:true})
                types.push('recording:"*'+type+'*"~2 OR release:"*'+type+'*"~2');
            })
        }
        if(cl.op) {
            var op ='"op~ *'+cl.op[0];
            if(cl.op[1]) {
                var op1=op+' '+cl.op[1]+'*"~2';
                var op2 = op+' '+tools.toroman(cl.op[1])+'*"~2';
                op = op1;
            }else{
                op+='*"';
            }
            op = 'recording:'+op+' OR release:'+op;
            if(op2) op+=' OR recording:'+op2+' OR release:'+op2;
        }

		var q = 'http://musicbrainz.org/ws/2/recording/?query=';
		q+='recording:'+recording;
		q+=' AND artistname:'+artistname;
		qq+=' AND tracks.artist.name:'+fartistname;
		q+=' AND ('
		//qq+=' AND ('
		if(creditname) q+=creditname;
		if(release){
			q+=' release:('+release+')^10';
			//qq+=' tracks.album:('+release+')^10';
		}

		q+=' status:official^100 format:(vinyl~)^100 format:"cd"^50 primarytype:album^100 country:US^190 country:GB^200';
		//qq+=' AND (status:official^100 format:(vinyl~)^100 format:"cd"^50 primary_type:album^100 country:FR^200)';
        q+=')&limit=10&fmt=json'
		//qq+=')'
		info.query = q;
		info.classical.query = decodeURIComponent(qq);
        if(log) console.Yolk.say(q)
        if(log) console.Yolk.say('---------------------------------------------------------------------------------------------------------------------------------');

	}else{
		if(!info.metadata.artist || !info.metadata.title) return false;
        info.disambig = [];
        var postfix = tools.postfix(info.metadata.title);
        if(postfix) info.disambig.push({dis:postfix.postfix});

        if(info.duration){
            var bottom = (Math.floor(info.duration/1000)*1000)-600;
            var top = (Math.ceil(info.duration/1000)*1000)+600;
            var duration='dur:['+bottom+' TO '+top+']^10'
        }
		if(info.type === 'youtube'){
            var artists = info.artists||[]
            artists.unshift({
                name:info.metadata.artist
            });
            artists = artists.map(function(artist){
                return '"'+tools.queryBuilder(artist.name)+'"'
            })
            artists = artists.join(' OR ')
            var title = tools.queryBuilder(info.metadata.title);
			title = '("'+title+'"^1000000 OR ('+title+'))'
			//var qq = title+' AND tracks.artist.name:('+artists+')'
			var qq = title
            var q = 'http://musicbrainz.org/ws/2/recording/?query=recording:'+title+' AND artist:('+artists+') ';
            q+= 'AND (';
            if(duration) q+= duration+' ';
            q+='format:vinyl~^2 primarytype:album^2 status:official^2)&fmt=json&limit=10'
			info.dbquery = decodeURIComponent(qq);
            info.query = q;
		}else{
            if(info.metadata.album){
                postfix = tools.postfix(info.metadata.album)
                if(postfix) info.disambig.push({dis:postfix.postfix});
            }
            if(info.metadata.album) var album = 'release:"'+tools.queryBuilder(info.metadata.album)+'"~1^50'

            var artists = info.metadata.artist.split(/(?:[\/\,\&\+]| - | and | et | by | with | conductor | ft | feat )/g).map(function(artist){return artist.trim()}).filter(function(artist){
                if(artist.length){return true}
            });
            if(artists.indexOf(info.metadata.artist) === -1) artists.push(info.metadata.artist);
            artists = '('+artists.map(function(artist){
				var a = tools.queryBuilder(artist);
				return 'artistname:('+a+')^75 OR creditname:('+a+')'
			}).join(' OR ')+')'

            var title = 'recording:('+tools.queryBuilder(info.metadata.title)+')^100'

            var q = 'http://musicbrainz.org/ws/2/recording/?query='+title+' ';
            if(artists) q+= 'AND '+artists+' '
            q+= 'AND (';
            if(album) q+= album+' ';
            if(duration) q+= duration+' ';
            q+='format:vinyl~^2 primarytype:album^2 status:official^2)&fmt=json&limit=10'

			info.query = q;
		}
	}
	return info;
}


module.exports = new mbtools();
