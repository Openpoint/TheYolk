mbtools.prototype.fixAlbums = function(albums){
	return;
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
            if(log) console.Yolk.warn(parse);
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
			console.Yolk.log('get albums')
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
                {should:query},{must:[{match:{deleted:{query:'no',type:'phrase'}}}]}
            ]);
            if(log) console.Yolk.log(query)
			console.Yolk.log('get tracks')
            elastic.fetchAll({index:db_index,type:'internetarchive,local',body:{query:query}}).then(function(tracks){
                resolve(tracks);
            },function(err){
                console.Yolk.error(err)
            })
        })
    },
    parse:function(albums,tracks){
        if(log) console.Yolk.warn(albums);
        if(log) console.Yolk.warn(tracks);
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
            if(log) console.Yolk.say(album.metadata.title.toUpperCase())
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
            if(log) console.Yolk.log(albumTracks)
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

        if(log) console.Yolk.warn(lps.concat(other));

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
