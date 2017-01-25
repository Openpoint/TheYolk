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
		settings:{
			analysis: {
			   analyzer: {
				  case_insensitive: {
					 tokenizer: "keyword",
					 filter: [
						"lowercase"
					 ]
				  }
			   }
		   },
		   "index.mapping.total_fields.limit": 5000
		},
		types:Types()
	},
	module_name:"musicPlayer",
	settings:{
		paths:{},
		state:{
			state1:"",
			state2:""
		},
		fileTypes:[".mp3",".wav",".ogg"]
	},
	data:{
		artist_images:"images/artist",
		album_images:"images/album"
	},
	headers:{
	    'User-Agent': 'Yolk MusicPlayer/0.0.0 ( http://openpoint.ie )' //todo - automatically update version in UA
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
			},
			exact:{
				type:  "string",
				analyzer: "case_insensitive"
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
			},
			tracks:{
				type:'nested',
				properties:{
					title:Mapping(),
					artist:{
						properties:{
							title:Mapping()
						}
					}
				}
			}
		}
	}
}
function Types(){
	return [
		{type:'local',mapping:mapping()},
		{type:'jamendo',mapping:mapping()},
		{type:'internetarchive',mapping:mapping()},
		{type:'youtube',mapping:mapping()},
		{type:'torrents',mapping:mapping()},
		{
			type:'internetarchivesearch',
			mapping:{
				properties:{
				}
			}
		},{
			type:'artist',
			mapping:{
				properties:{
					deleted:{
						type:"string"
					},
					name:Mapping()
				}
			},
		},{
			type:'album',
			mapping:mapping(),
		},{
			type:'searches',
			mapping:{
				properties:{
				}
			}
		},{
			type:'release',
			mapping:{
				properties:{
					album:Mapping()
				}
			}
		}
	]
}
module.exports = define
