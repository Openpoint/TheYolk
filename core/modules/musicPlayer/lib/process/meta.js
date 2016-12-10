"use strict";
/*
Fetch detailed artist and album information and process artwork
*/

const path=require('path');
const q = require('promise');
const os = require('os');
const request = require('request');
const sharp = require('sharp');
const smartcrop = require('smartcrop-sharp');
const {webContents,BrowserWindow,ipcMain} = require('electron');
const ft = require(path.join(process.cwd(),'core/lib/filetools'));
const fs = require('fs');
const homedir = path.join(os.homedir(),'.yolk');

//create a browser window for face detection on images
var win = new BrowserWindow({show:false});
win.webContents.openDevTools();
win.loadURL(`file://${__dirname}/artwork.html`);
var message = win.webContents;

//close the window when application exits
ipcMain.on('chrome', function(event, data) {
	switch (data){
		case 'close':
			win.destroy();
		break;
	}
})

if(typeof Yolk !== 'undefined'){
    var base = path.join(Yolk.config.modules.musicPlayer.path,'core');
}else{
    var base = path.join(process.cwd(),'core');
}
const db = require(path.join(base,'lib/elasticsearch.js')).ready();

const settings = require(path.join(base,'modules/musicPlayer/musicPlayer.js'))
const db_index = settings.db_index.index;
const mb_url="https://musicbrainz.org/ws/2/";
const mb_query="?inc=url-rels&fmt=json";
var options = {};
var headers = {
    'User-Agent': 'Yolk MusicPlayer/0.0.0 ( http://openpoint.ie )' //todo - automatically update version in UA
}

var artwork = {
	artist:{
	    ids:[]
	},
	album:{
	    ids:[]
	},
	q:[]
};
//check if the artist or album is already in the database
artwork.exists=function(type,id){
    var promise = new q(function(resolve,reject){
        var exists =  db.client.get({
            index:db_index,
            type:type+'s',
            id:id
        },function(err,data){
            if(err){
                resolve(false);
            }else{
				message.send('log',data);
				if(data['_source'].artwork){
					resolve(true);
				}else{
					resolve(type);
				}

            }
        })
    })
    return promise;
}
//add an artist and album to the processing queue
artwork.add = function(track){

	var both = [{
		id:track.artist,
		type:'artist'
	},{
		id:track.album,
		type:'album'
	}]

	both.forEach(function(type){
		if(type.type === 'album' && !track.album){
			return;
		}
		//message.send('log',track.metadata[type.type]+': Checking')
		try{
			var id = type.id;
			var type = type.type;
			if(artwork[type].ids.indexOf(id) === -1){
		        artwork[type].ids.push(id);
		        artwork.exists(type,id).then(function(exists){
		            if(!exists || exists === type){
						message.send('log',track.metadata[type]+': Adding to queue');
						if(type === 'album'){
							var query = mb_url+'release/'+id+mb_query
						}else{
							var query = mb_url+type+'/'+id+mb_query;
						}

		        		options.url = query;
						var item = {
		                    track:track,
		                    options:{
								headers:headers,
								url:query
							},
							needs:exists,
							type:type
		                }
						if(type === 'album'){
							new downart("http://coverartarchive.org/release/"+id+"/front",item);
						}
						artwork.q.push(item);
		                if(!timeout){
		                    go();
		                }
		            }
		        })
		    }
		}
		catch(err){
			message.send('error',err)
		}
	})


}
//process the musicbrainz queue at a sane rate;
var timeout=false;
var go = function(){
    new submit();
    timeout = setTimeout(function(){
        timeout = false;
        if(artwork.q.length > 0){
            go();
        }
    },1000)
}
//submit query to musicbrainz server
var submit = function(){
    var item = artwork.q.shift();
	message.send('log',item.track.metadata[item.type]+' : MusicBrainz - '+item.options.url)
    request.get(item.options,function(error, response, body){
        if (!error && response.statusCode == 200) {
			try{
				var art = JSON.parse(body);
			}
            catch(err){
				message.send('error',err);
				return;
			}
			if(item.type === 'album'){
				message.send('log',art)
				return;
			}
            if(art.relations.length){
				var discoqs;
				//look for image and discoq links
                var images = art.relations.filter(function(object){
					if(object.type === 'discogs'){
						discoqs = object.url.resource+'/images'
					}
                    if(object.type === 'image'){
                        return true;
                    }
                })
                if(images.length){
					//found links to wikimedia images
					images.forEach(function(image){
						message.send('log',item.track.metadata[item.type]+': Wikimedia- '+image.url.resource)
					})
                    new getart(images,item);
                }else{

					if(discoqs){
						//scrape the discoqs page
						message.send('log',item.track.metadata[item.type]+': Getting image from Discoqs');
						var win2 = new BrowserWindow({
							show:false,
							webPreferences: {
						      nodeIntegration: true,
						      webSecurity: true,
						      preload: path.resolve(path.join(__dirname, 'scraper.js'))
						    }
						});
						//win2.webContents.openDevTools();
						win2.loadURL(discoqs);
						win2.webContents.on('did-finish-load',function(){
							win2.webContents.executeJavaScript('scrape()',true).then(function(data){
								if(data && data.length){
									new downart(data,item,true);
								}else{
									//couldn't get the image from discoq, so try Google
									new getGoogle(item)
								}
								win2.destroy();
							})
						})
						setTimeout(function(){
							if(!win2.isDestroyed()){
								win2.destroy();
								new getGoogle(item);
							}
						},5000)
					}else{
						new getGoogle(item)
					}
				}
            }else{
				new getGoogle(item)
			}
			if(!item.needs){
				var db_path = db_index+'.artists.'+item.track[item.type];
	            db.put(db_path,JSON.parse(body)).then(function(data){

	            },function(err){
	                message.send('error',err);
	            })
			}

        }else{
            if(response){
				message.send('error','retry MusicBrainz'+item.track.metadata[item.type])
                artwork.q.push(item);
            }
        }
    })
}
//all else failed, so look for an image on google
var googleIndex={}
var getGoogle = function(item,retry){
	if(!googleIndex[item.track[item.type]]){
		googleIndex[item.track[item.type]]=0;
	}else{
		googleIndex[item.track[item.type]]++;
	}
	message.send('log',item.track.metadata[item.type]+': Getting image from Google');
	var win2 = new BrowserWindow({
		show:false,
		webPreferences: {
		  nodeIntegration: true,
		  webSecurity: true,
		  preload: path.resolve(path.join(__dirname, 'scraper.js'))
		}
	});

	if(item.type === 'album'){
		search+search+'+album+cover';
		var search = encodeURI(item.track.metadata.artist+' '+item.track.metadata.album+' album cover front').replace(/%20/g,'+');
	}else{
		var search = encodeURI(item.track.metadata[item.type]).replace(/%20/g,'+');
	}
	var url ='https://www.google.ie/search?q='+search+'&tbm=isch&tbs=isz:l,itp:photo';
	//win2.webContents.openDevTools();
	win2.loadURL(url);
	win2.webContents.on('did-finish-load',function(){
		win2.webContents.executeJavaScript('firstClick('+googleIndex[item.track[item.type]]+')',true).then(function(data){
			win2.destroy();
			new downart(data,item,true);
		},function(err){
			win2.destroy();
			message.send('error',err);

		})
	})
	setTimeout(function(){
		if(!win2.isDestroyed()){
			win2.destroy();
			if(!retry){
				googleIndex[item.track[item.type]] === 0;
				new getGoogle(item,true);
			}
		}
	},5000)
}
//find the artist image
var getart=function(images,item){
	var track = item.track;
    this.options={
		headers:headers
	};
	this.id = track[item.type];
    var self = this;

    var count=0;
    images.forEach(function(image,index){
		count++
        var wikipage = image.url.resource.split('/');
        wikipage = wikipage[wikipage.length-1];
        self.options.url='https://commons.wikimedia.org/w/api.php?action=query&titles='+wikipage+'&prop=imageinfo&iiprop=url&format=json';
		//message.send('log',track.metadata.artist+' : '+self.options.url)
        request.get(self.options,function(error, response, body){
            if(!error && response.statusCode == 200){
                body = JSON.parse(body);
				Object.keys(body.query.pages).forEach(function(key){
					if(body.query.pages[key].imageinfo && body.query.pages[key].imageinfo[0] && body.query.pages[key].imageinfo[0].url){
						var src = body.query.pages[key].imageinfo[0].url;
	                	new downart(src,item);
					}else if(count === images.length){
						new getGoogle(item)
					}
				})
            }else if(count === images.length){
				new getGoogle(item)
			}
        })
    })
}
//download the artist or album image
var downart = function(src,item){
	var track2 = item.track;
	message.send('log',track2.metadata[item.type]+': Downloading art from '+src);
	var id = track2[item.type];
	var dest = path.join(homedir,'data/modules/musicPlayer/images/'+item.type+'s/'+id);
	if(!ft.isThere('dir',dest)){
		ft.mkdir(homedir,'data/modules/musicPlayer/images/'+item.type+'s/'+id);
	}
	var reduced = path.join(dest,'reduced.jpg');
	if(!ft.isThere('file',reduced)){
		var options = {
			url:src,
			encoding:null,
			headers:headers
		}
		request(options, function process(error, response, body) {
			if(!error && response.statusCode == 200){
				sharp(body).resize(600).toFile(reduced,function(err,info){
					if(!err){
						new proceed(reduced,dest,item)
					}
				});
			}else{
				new getGoogle(item)
			}
		})
	}else{
		new proceed(reduced,dest,item)
	}
	function proceed(src,thumb,item){
		var track = item.track;
		var face = "face('"+src+"')"
	    var foo = win.webContents.executeJavaScript(face,true);

		foo.then(function(data){
			var confidence;

			if (data.length){
				data.forEach(function(face){
					if(!confidence){
						confidence = face.confidence;
					}else if(face.confidence > confidence){
						confidence = face.confidence;
					}
				})
				data = data.filter(function(face){
					if(face.confidence === confidence){
						return true;
					}
				})
	            var data2 = data.map(function(face){
	                return {
	                    x:face.x,
	                    y:face.y,
	                    width:face.width,
	                    height:face.height,
						weight:1
	                }
	            })
				//message.send('log',track.metadata.artist+': found face')
				crop(data2);
	        }else{
				//message.send('log',track.metadata.artist+': no faces found')
				crop(false);
			}
			function crop(boost){

	            dest = path.join(thumb,'thumb.jpg');

				new applySmartCrop(src,dest,250,250,boost,item);
			}
		},function(err){
			messsage.send('err',err)
		})
	}
}

var applySmartCrop=function(src, dest, width, height,boost,item) {
	var track = item.track;
	var options = {
		width: width,
		height: height
	}
	if(boost){
		options.boost = boost;
	}
	try{
		smartcrop.crop(src, options).then(function(result) {
			var crop = result.topCrop;
			sharp(src)
			.extract({width: crop.width, height: crop.height, left: crop.x, top: crop.y})
			.resize(width, height)
			.toFile(dest);
			db.update(db_index+'.'+item.type+'s.'+track[item.type],{
				artwork:true
			})
			message.send('log',track.metadata[item.type]+': Image saved')
		});
	}
	catch(err){
		message.send('error',err)
	}
}

module.exports = artwork;
