"use strict"

var define = {
	extends:false,
	require:[
		//load services from external modules
		'utils'
	],
	core_process:[
		//starts with the core process in a Node scope, put corresponding file in modules 'lib/process' folder
		'fileTools',
		'musicbrainz'
	],
	db_index:{
		index:"music_player",
		types:Types()
	},
	module_name:"musicPlayer",
	settings:{
		paths:{

		},
		state:{
			state1:"",
			state2:""
		},
		fileTypes:[".mp3",".wav",".ogg"]
	},
	data:{
		artist_images:"images/artists",
		album_images:"images/albums"
	}
}
function Mapping(){
	return {
		type: "string",
		analyzer: "english",
		fields:{
			raw:{
				type:  "string",
				index: "not_analyzed"
			}
		}
	}
}
function mapping(){
	return {
		properties:{
			deleted:{
				type:"string"
			},
			metadata:{
				properties:{
					title:Mapping(),
					artist:Mapping(),
					album:Mapping()
				}
			}
		}
	}
}
function Types(){
	return [
		{
			type:'local',
			mapping:mapping()
		},{
			type:'jamendo',
			mapping:mapping()
		},{
			type:'internetarchive',
			mapping:mapping()
		},{
			type:'youtube',
			mapping:mapping()
		},{
			type:'torrents',
			mapping:mapping()
		},{
			type:'internetarchivesearch',
			mapping:{
				properties:{
				}
			}
		},{
			type:'artists',
			mapping:{
				properties:{
				}
			}
		},{
			type:'albums',
			mapping:{
				properties:{
				}
			}
		},{
			type:'searches',
			mapping:{
				properties:{
				}
			}
		}
	]
}
module.exports = define
