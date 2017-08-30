"use strict"

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

var define = {
	extends:false,
	home:{
		label:'Music Player',
		icon:{
			fontawesome:'fa-music',
			svg:false,
			png:false
		}
	},
	require:[], //load services from external modules
	core_process:['fileTools','musicbrainz','background'], //starts with the core process in a Node scope, put corresponding file in modules 'lib/process' folder
	db_index:{
		index:"music_player",
		settings:{analysis:{analyzer: {case_insensitive: {
			tokenizer: "keyword",
			filter: ["lowercase"]
			}}},
			"index.mapping.total_fields.limit": 5000
		},
		types:Types()
	},
	module_name:"musicPlayer",
	settings:{
		paths:{},
		fileTypes:["mp3","ogg","wav"],
	},
	progress:{
		title:0,
		album:0,
		artist:0
	},
	data:{artist_images:"images/artist",album_images:"images/album"},
	headers:{'User-Agent': 'Yolk MusicPlayer/0.0.0 ( http://openpoint.ie )'},//todo - automatically update version in UA
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
			id:{type:"string"},
			deleted:{type:"string"},
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
					title2:Mapping(),
					artist:{properties:{name:Mapping()}},
					artists:{
						type:'nested',
						properties:{name:Mapping()}
					},
					id:Mapping(),
					id2:Mapping(),
					disambig:{type:'nested',properties:{}},
					position:{type:'integer'}
				}
			},
			musicbrainz_id:Mapping(),
			classical:{
				properties:{
					artist:{
						type:'nested',
						properties:{
							name:Mapping()
						}
					}
				}
			},
			artists:{
				type:'nested',
				properties:{
					id:{type:'string'},
					name:Mapping()
				}
			},
			disambig:{
				type:'nested',
				properties:{
					dis:{type:'string'}
				}
			},
			played:{
				type:'date'
			}
		}
	}
}
function Types(){
	return [
		{type:'local',mapping:mapping()},
		{type:'internetarchive',mapping:mapping()},
		{type:'youtube',mapping:mapping()},
		{type:'internetarchivesearch',
			mapping:{
				properties:{
				}
			}
		},
		{type:'youtubesearch',mapping:mapping()},
		{type:'youtubeartists',mapping:{properties:{}}},
		{type:'artist',
			mapping:{
				properties:{
					deleted:{type:"string"},
					id:{type:"string"},
					name:Mapping()
				}
			},
		},
		{type:'album',mapping:mapping()},
		{type:'playlists',mapping:{properties:{}}},
		{type:'searches',mapping:{properties:{}}},
		{type:'release',mapping:{properties:{
			tracks:{
				type:'nested',
				properties:{
					title:Mapping(),
					id:Mapping(),
					artist:{
						properties:{name:Mapping()}
					},
					artists:{
						type:'nested',
						properties:{name:Mapping()}
					},
					disambig:{
						type:'nested',
						properties:{}
					}
				}
			},
			disambig:{
				type:'nested',
				properties:{
					dis:{type:'string'}
				}
			},
			album:Mapping(),
			artist:Mapping(),
			type:Mapping(),
			type2:Mapping(),
			country:Mapping(),
			format:Mapping(),
			status:Mapping(),
		}}},
	]
}
module.exports = define
