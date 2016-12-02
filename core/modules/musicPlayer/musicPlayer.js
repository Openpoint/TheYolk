"use strict"

var define = {
	extends:false,
	require:[
		//load services from external modules
		'utils'
	],
	core_process:[
		//starts with the core process in a Node scope
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
			musicDir:"",
			dataDir:""
		},
		state:{
			state1:"",
			state2:""
		},
		fileTypes:[".mp3",".wav",".ogg"]
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
			type:'internetarchivesearch'
		},{
			type:'youtube',
			mapping:mapping()
		},{
			type:'torrents',
			mapping:mapping()
		},{
			type:'searches'
		},
	]
}
module.exports = define
