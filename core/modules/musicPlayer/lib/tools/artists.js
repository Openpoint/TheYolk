"use strict";
const path=require('path');
const q = require('promise');
const request = require('request');

if(typeof Yolk !== 'undefined'){
    var base = path.join(Yolk.config.modules.musicPlayer.path,'core');
}else{
    var base = path.join(process.cwd(),'core');
}
const db = require(path.join(base,'lib/elasticsearch.js')).ready();

const settings = require(path.join(base,'modules/musicPlayer/musicPlayer.js'))
const db_index = settings.db_index;
const mb_url="http://musicbrainz.org/ws/2/artist";
const mb_query="?inc=url-rels&fmt=json";
var options = {};
options.headers = {
    'User-Agent': 'Yolk MusicPlayer/0.0.0 ( http://openpoint.ie )' //todo - automatically update version in UA
}

var artist = {};
artist.exists=function(id){
    var promise = new q(function(resolve,reject){
        var exists =  db.client.get({
            index:db_index,
            type:'artists',
            id:id
        },function(err,data){
            if(err){
                resolve(false);
            }else{
                resolve(true);
            }
        })
    })
    return promise;
}
artist.add=function(id){
    console.log(id);
    return;
    artist.exists(id).then(function(exists){
        if(!exists){
            var query =mb_url+id+mb_query;
    		options.url = query;
            console.log(options)
    		request.get(options,function(error, response, body){
    			if (!error && response.statusCode == 200) {
                    console.log(JSON.parse(body))
                }else{
                    console.log(error)
                    console.log(response)
                }
            })
        }else{
            console.log('found')
        }
    })
}

module.exports = artist;
