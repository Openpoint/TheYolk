"use strict";

const {ipcMain} = require('electron');
const tools = require('./searchtools.js');
const classictools = require('./musicbrainzclassical.js');
const elastic = process.Yolk.db;
const db_index = process.Yolk.modules.musicPlayer.config.db_index.index;
const meta = require('../process/meta.js');
const message = process.Yolk.message;
const q = require('promise');

const log = false;

var kill = false;

var mbtools = function(){
    this.preferred_release = 'GB';
};

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
        releases.push({update:{_index:db_index,_type:'release',_id:release.doc.id}});
        releases.push({
            doc:release.doc,
            doc_as_upsert:true,
        });

        releases.push({update:{_index:db_index,_type:'release',_id:release.doc.id}});
        releases.push({body:{
            script:{
                //inline:"if(!ctx._source.containsKey(\"tracks\")){ctx._source.tracks = new ArrayList()} ctx._source.tracks.add(params.track)",
                inline:"if(!ctx._source.containsKey(\"tracks\")){ctx._source.tracks = new ArrayList()} def match=0; for(ttrack in ctx._source.tracks) {if(ttrack.title == params.track.title){match = 1}} if(match === 0){ctx._source.tracks.add(params.track)}",
                params:{track:release.track}
            }
        }});
    })
    if(releases.length){
        return releases
    }else{
        return false
    }
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
        var artist = release.media[0].track[0]['artist-credit'][0].artist.name
    }else{
        var artist = recording.artist
    }

    var track = {
        title:title1,
        artist:{name:artist},
        artists:recording.artists,
        id:recording.id,
    }

    if(title1!==title2){
        track.title = title2;
        track.title2=title1;
    }

    track.disambig = disambig.length?disambig : [];

    if(release.media[0].track[0].length) track.length = Number(release.media[0].track[0].length);

    var Release = {
        doc:{
            id:release.id,
            country:release.country,
            date:release.date ? Number(new Date(release.date)):0,
            format:format,
            album:tools.fix(release.title),
            artist:release['artist-credit'][0].artist.name,
            status:release.status ? release.status.toLowerCase():'unknown',
            type:type,
            type2:type2,
        },
        track:track
    };
    return Release
}
//save a track to the database
mbtools.prototype.saveTrack = function(track){
    return new q(function(resolve,reject){
        if(kill){
            console.Yolk.error('KILL');
    		return;
    	}
    	if(track.type === 'internetarchive'){
    		elastic.update({index:db_index,type:'internetarchivesearch',id:track.id,body:{doc:{musicbrainzed:'yes'}},refresh:true}).then(function(data){},function(err){
    			console.Yolk.error(err);
    		})
    	}
    	if(track.type === 'local'){
    		elastic.update({index:db_index,type:track.type,id:track.id,body:{doc:track},refresh:true}).then(function(data){
    			message.send('refresh',track.type);
                resolve();
    		},function(err){
    			console.Yolk.error(err);
                resolve();
    		})
    	}else{
    		elastic.client.create({index:db_index,type:track.type,id:track.id,body:track,refresh:true},function(err,data){
    			if(err){
    				console.Yolk.error(err);
                    resolve();
    			}else{
    				message.send('refresh',track.type);
                    resolve();
    			}
    		})
    	}
    })

}
//format and save album or artist to the database
mbtools.prototype.saveMeta = function(type,body){
	if(kill){
        console.Yolk.error('KILL');
		return;
	}
    return new q(function(resolve,reject){
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
    	}

    	switch (type){
    		case 'artist':
    			tosave.country = body.country;
    			tosave.id = body.id.toString();
    			tosave.name = tools.fix(body.name);
    			artwork.name = tools.fix(body.name);
    			save();
    		break;
    		case 'album':
    			if(body['cover-art-archive'] && body['cover-art-archive'].front){
    				artwork.coverart = body['cover-art-archive'].front;
    			};
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
                                disambig:track.recording.disambiguation?[{dis:tools.fix(track.recording.disambiguation)}]:[]
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
    			//first check if a different release of the same album already exists
    			elastic.client.search({
    				index:db_index,
    				type:'album',
    				body:{query:{bool:{must:[
    					{match:{'metadata.title.exact':{
    						query:tools.fix(body.title),
    					}}},
    					{match:{'metadata.artist':{
    						query:tools.fix(body['artist-credit'][0].name),
    						operator:'and'
    					}}}
    				]}}}
    			},function(err,data){
    				if(err){
    					console.Yolk.error(err);
                        resolve();
    				}else if(data.hits.hits.length){
    					tosave.date = Date.now();
    					tosave.deleted = 'no';

    					//delete the old album release and save the new one
    					var bulk = [
    						//{delete:{_index:db_index,_type:'album',_id:data.hits.hits[0]._id}},
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
    							if(err){
    								console.Yolk.error(err);
                                    resolve();
    							}else{
    								meta.add(artwork);
                                    resolve();
    							}
    						})
    					},function(err){
    						console.Yolk.error(err);
                            resolve();
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
                if(err){
                    console.Yolk.error(err);
                    resolve('ERROR SAVING ------------- '+tosave.id);
                }else{
                    message.send('refresh',type);
                    meta.add(artwork)
                    resolve('SAVED ------------- '+tosave.id);
                }
            })

    	}
    })
}
mbtools.prototype.fixAlbums = function(albums){

    var self = this.Albums;
    var allAlbums;
    var allTracks;
    self.getAlbums(albums).then(function(albums){
        add(albums,false);
    })
    self.getTracks(albums).then(function(tracks){
        add(false,tracks);
    })
    function add(albums,tracks){
        if(albums) allAlbums = albums;
        if(tracks) allTracks = tracks;
        if(allAlbums && allTracks){
            var parse = self.parse(allAlbums,allTracks);
            console.Yolk.warn(parse);
            var query = [];
            parse.forEach(function(album){
                if(album._tracks.length){
                    album._tracks.forEach(function(track){
                        query.push({update:{ _index:db_index, _type:track.type, _id:track.id}});
                        query.push({doc:track.new})
                    })
                }else{
                    query.push({update:{ _index:db_index, _type:'album', _id:album.id}});
                    query.push({doc:{deleted:'yes'}})
                }
            })

            elastic.client.bulk({body:query,refresh:'true'},function(err,data){
                if(err){console.Yolk.error(err)}
            })
        }

    }
}
mbtools.prototype.Albums = {
    getAlbums:function(albums){
        var query = [];
        albums.forEach(function(id){
            query.push({match:{id:{query:id,type:'phrase'}}});
        })
        var query = tools.wrap.bool([{should:query}]);
        return new q(function(resolve,reject){
            elastic.fetchAll({index:db_index,type:'album',body:{query:query}}).then(function(data){
                resolve(data);
            })
        })
    },
    getTracks:function(albums){
        return new q(function(resolve,reject){
            var query = [];
            albums.forEach(function(album){
                query.push({match:{album:{query:album,type:'phrase'}}})
            })
            query = tools.wrap.bool([
                {
                    should:query

                },
                {
                    must:[{match:{deleted:{query:'no',type:'phrase'}}}]
                }
            ]);
            console.Yolk.log(query)
            elastic.fetchAll({index:db_index,type:'internetarchive,local',body:{query:query}}).then(function(tracks){
                resolve(tracks);
            },function(err){
                console.Yolk.error(err)
            })
        })
    },
    parse:function(albums,tracks){
        console.Yolk.warn(albums);
        console.Yolk.warn(tracks);
        function newtrack(track,track2,album){
            var Newtrack = {
                id:track2.id,
                metadata:track2.metadata,
                musicbrainz_id:track2.musicbrainz_id,
                type:track2.type,
                disambig:track2.disambig,
            };
            Newtrack.new = {
                musicbrainz_id:track.id,
                album:album.id,
                metadata:{
                    album:album.metadata.title,
                    title:track.title
                }
            }
            return Newtrack;
        }
        albums.forEach(function(album,index){
            console.Yolk.say(album.metadata.title.toUpperCase())
            var albumTracks = [];
            tracks.forEach(function(track2,index2){
                if(!track2.metadata){return}
                var fix = false;
                if(track2.hasOwnProperty('fix') || track2.hasOwnProperty('classical')) fix =true;

                album.tracks.some(function(track,index3){
                    var condition;
                    if(fix){
                        condition = track.id === track2.musicbrainz_id;
                    }else{
                        var disambig = true;
                        if(track2.disambig.length){
                            if(!track.disambig.length){disambig = false}else{
                                disambig = track2.disambig.some(function(term){
                                    return track.disambig.some(function(term2){
                                        return term2.dis === term.dis;
                                    })
                                })
                            };
                        }
                        var samealbum = true;
                        if(!track2.metadata.old_album && !track2.metadata.old_album2) samealbum =(album.metadata.title === track2.metadata.album||album.metadata.title === track2.metadata.old_album||album.metadata.title === track2.metadata.old_album2)
                        condition = (
                            (track.title === track2.metadata.title||track.title === track2.metadata.old_title||track.title === track2.metadata.old_title2)&&
                            (track.artist.name === track2.metadata.artist||track.artist.name === track2.metadata.old_artist||track.artist.name === track2.metadata.old_artist2)&&
                            disambig && samealbum
                        )
                    }
                    if(condition){
                        var Newtrack = newtrack(track,track2,album);
                        albumTracks.push(Newtrack)
                        return true
                    }else{
                        return false;
                    }

                })

            })
            console.Yolk.log(albumTracks)
            albums[index]._tracks = albumTracks;

        })
        albums.sort(function(a,b){
            if(a._tracks.length > b._tracks.length){return -1};
            if(a._tracks.length < b._tracks.length){return 1};
            return 0;
        })

        function full(albums){
            var full=[];
            var partial=[];
            albums.forEach(function(album){
                if(album._tracks.length === album.tracks.length){
                    full.push(album)
                }else{
                    partial.push(album)
                }
            })
            return full.concat(partial)
        }
        var lps = full(albums.filter(function(album){
            if(album.secondary_type === 'lp'){return true}
        }));
        var other = full(albums.filter(function(album){
            if(album.secondary_type !== 'lp'){return true}
        }));

console.Yolk.warn(lps.concat(other));

        albums = lps.concat(other);

        var tracks = [];

        albums.forEach(function(album,index){
            if(album._tracks.length){
                var goodtracks = album._tracks.filter(function(track){
                    return tracks.every(function(track2){
                        if (track2.musicbrainz_id === track.musicbrainz_id){
                            return false
                        }
                        return true;
                    })
                })
                albums[index]._tracks = goodtracks;
                tracks = tracks.concat(goodtracks)
            }
        })
        return albums;
    },
}

//construct query strings for API lookups
mbtools.prototype.musicbrainz = function(info){
	if(info.type === 'youtube'){
		return;
	}
	var self = this;

	//strip leading track number from track title
	if(info.metadata.title && Number(info.metadata.title.split(' ')[0].replace('.',''))>=0){
		var title = info.metadata.title.split(' ');
		title.shift();
		info.metadata.title = title.join(' ');
	}

    var isclassic = classictools.get(info);

	if(isclassic){
        info = isclassic;
        if(info.musicbrainz_id){
            info.fix = true;
            var query = 'http://musicbrainz.org/ws/2/recording/'+info.musicbrainz_id+'?'+'&inc=artists+artist-rels+releases+release-groups+release-rels+release-group-rels+media&fmt=json';
            info.query = query
            if(log) console.Yolk.say(query)
            return info;
        }
        if(info.duration){
            var bottom = (Math.floor(info.duration/1000)*1000)-600;
            var top = (Math.ceil(info.duration/1000)*1000)+600;
            var duration='['+bottom+' TO '+top+']'
        }
		var cl = info.classical;
		var md = info.metadata;
		var artistname = tools.queryBuilder(cl.composer);
		if(cl.artist) var creditname = cl.artist.map(function(artist){
            var foo = tools.queryBuilder(artist.name,{fuzzy:true})+'"~1^2'
            return 'artistname:"'+foo+' OR creditname:"'+foo
        }).join(' OR ')
		var recording = tools.queryBuilder(md.title);
		var release = tools.queryBuilder(md.album);
        if (cl.cat) var cat = '"'+cl.cat.id+' '+cl.cat.val+'"';
        if(cl.key) var key = 'recording:"'+cl.key.join(' ')+'"';
        if(cl.types){
            var types = []
            Object.keys(cl.types).forEach(function(type){
                var type = tools.queryBuilder(type+' '+cl.types[type],{fuzzy:true})
                types.push('recording:"'+type+'"~2 OR release:"'+type+'"~2');
            })
        }
        if(cl.op) {
            var op ='"op~ '+cl.op[0];
            if(cl.op[1]) {
                var op1=op+' '+cl.op[1]+'"~2';
                var op2 = op+' '+tools.toroman(cl.op[1])+'"~2';
                op = op1;
            }else{
                op+='"';
            }
            op = 'recording:'+op+' OR release:'+op;
            if(op2) op+=' OR recording:'+op2+' OR release:'+op2;
        }

		var q = 'http://musicbrainz.org/ws/2/recording/?query=recording:('+recording+')^10 AND artistname:"'+artistname+'" '
        if(key) q+='AND '+key+' ';
        if(creditname) q+='AND ('+creditname+') ';
        if(types) q+='AND ('+types.join(' OR ')+') ';
        if(op) q+='AND ('+op+') ';
        q+='AND ('
        if(release) q+='release:('+release+')^10 '
        q+='status:official^2 format:(vinyl~)^2 primarytype:album^2 ';
        if(duration) q+='dur:'+duration+'^10 ';
        if(cat) q+=cat+'^10 ';
        q=q.trim();
        q+=')'
        q+='&limit=10&fmt=json'
		info.query = q;
        if(log) console.Yolk.say(q)
        if(log) console.Yolk.say('---------------------------------------------------------------------------------------------------------------------------------');

	}else{
        delete info.classical;
		if(info.musicbrainz_id){
			info.fix = true;
		}else if(!info.metadata.artist || !info.metadata.title){
			return false;
		}
        info.disambig = [];
        var postfix = tools.postfix(info.metadata.title);
        if(postfix) info.disambig.push({dis:postfix.postfix});
        if(info.metadata.album){
            postfix = tools.postfix(info.metadata.album)
            if(postfix) info.disambig.push({dis:postfix.postfix});
        }
		if(info.type === 'youtube'){

		}else if(!info.musicbrainz_id){
			if(info.duration){
				var bottom = (Math.floor(info.duration/1000)*1000)-600;
				var top = (Math.ceil(info.duration/1000)*1000)+600;
				var duration='dur:['+bottom+' TO '+top+']^10'
			}

            if(info.metadata.album) var album = 'release:"'+tools.queryBuilder(info.metadata.album)+'"~1^50'
            if(info.metadata.artist){
                var artists = info.metadata.artist.split(/(?:[\/\,\&\+]| - | and | et | by | with | conductor | ft | feat )/g).map(function(artist){return artist.trim()}).filter(function(artist){
                    if(artist.length){return true}
                });
                if(artists.indexOf(info.metadata.artist) === -1) artists.push(info.metadata.artist);
                artists = '('+artists.map(function(artist){return 'artistname:"'+tools.queryBuilder(artist)+'"'}).join(' OR ')+')'
            }
            var title = 'recording:('+tools.queryBuilder(info.metadata.title)+')'

            var q = 'http://musicbrainz.org/ws/2/recording/?query='+title+' ';
            if(artists) q+= 'AND '+artists+' '
            q+= 'AND (';
            if(album) q+= album+' ';
            if(duration) q+= duration+' ';
            q+='format:vinyl~^2 primarytype:album^2 status:official^2)&fmt=json&limit=10'
            /*
			var query = 'http://musicbrainz.org/ws/2/recording/?query=(';
			if(info.metadata.album) query = query+'release:"'+tools.queryBuilder(info.metadata.album)+'"~2^50 release:('+tools.queryBuilder(info.metadata.album)+')^20';
			if(duration) query=query+' dur:'+duration+'^10';
			query = query+' format:vinyl~^2 quality:high^2 (primarytype:album AND status:official)^50)'

            if(info.metadata.artist){
                query = query+' AND (artistname:"'+tools.queryBuilder(info.metadata.artist)+'"~1';
                var artist = info.metadata.artist.split(/and|with|\&|\/|\-/g);
                if(artist.length > 1) artist.forEach(function(part){
                    if(part.trim().length) query = query+' OR artistname:"'+tools.queryBuilder(part.trim())+'"';
                })
                query = query+')'
            }
			query = query+' AND (recording:"'+tools.queryBuilder(info.metadata.title)+'"^10 OR recording:"'+tools.queryBuilder(info.metadata.title)+'"~2^5 OR recording:('+tools.queryBuilder(info.metadata.title)+'))&fmt=json&limit=10';
            */
			info.query = q;
		}else{
			var query = 'http://musicbrainz.org/ws/2/recording/'+info.musicbrainz_id+'?'+'&inc=artists+artist-rels+releases+release-groups+release-rels+release-group-rels+media&fmt=json';
			info.query = query
		}
	}
	return info;
}


module.exports = new mbtools();
ipcMain.on('kill', function(event,data) {
	if(data === 'revive'){
		kill = false;
		return;
	}
	kill = true;
})
