"use strict";(self.webpackChunksofie_documentation=self.webpackChunksofie_documentation||[]).push([[7579],{8515:(e,t,a)=>{a.r(t),a.d(t,{assets:()=>l,contentTitle:()=>o,default:()=>p,frontMatter:()=>i,metadata:()=>s,toc:()=>d});var n=a(5773),r=(a(7378),a(5318));const i={sidebar_label:"Introduction",sidebar_position:0},o="Sofie User Guide",s={unversionedId:"user-guide/intro",id:"version-1.37.0/user-guide/intro",title:"Sofie User Guide",description:"Key Features",source:"@site/versioned_docs/version-1.37.0/user-guide/intro.md",sourceDirName:"user-guide",slug:"/user-guide/intro",permalink:"/sofie-core/docs/1.37.0/user-guide/intro",draft:!1,editUrl:"https://github.com/nrkno/sofie-core/edit/master/packages/documentation/versioned_docs/version-1.37.0/user-guide/intro.md",tags:[],version:"1.37.0",sidebarPosition:0,frontMatter:{sidebar_label:"Introduction",sidebar_position:0},sidebar:"version-1.37.0/gettingStarted",next:{title:"Concepts & Architecture",permalink:"/sofie-core/docs/1.37.0/user-guide/concepts-and-architecture"}},l={},d=[{value:"Key Features",id:"key-features",level:2},{value:"Web-based GUI",id:"web-based-gui",level:3},{value:"Modular Device Control",id:"modular-device-control",level:3},{value:"<em>State-based Playout</em>",id:"state-based-playout",level:3},{value:"Modular Data Ingest",id:"modular-data-ingest",level:3},{value:"Blueprints",id:"blueprints",level:3}],c={toc:d},u="wrapper";function p(e){let{components:t,...i}=e;return(0,r.kt)(u,(0,n.Z)({},c,i,{components:t,mdxType:"MDXLayout"}),(0,r.kt)("h1",{id:"sofie-user-guide"},"Sofie User Guide"),(0,r.kt)("h2",{id:"key-features"},"Key Features"),(0,r.kt)("h3",{id:"web-based-gui"},"Web-based GUI"),(0,r.kt)("p",null,(0,r.kt)("img",{alt:"Producer&#39;s / Director&#39;s  View",src:a(4487).Z,width:"1548",height:"340"})),(0,r.kt)("p",null,(0,r.kt)("img",{alt:"Warnings and notifications are displayed to the user in the GUI",src:a(2975).Z,width:"734",height:"337"})),(0,r.kt)("p",null,(0,r.kt)("img",{alt:"The Host view, displaying time information and countdowns",src:a(4877).Z,width:"899",height:"553"})),(0,r.kt)("p",null,(0,r.kt)("img",{alt:"The prompter view",src:a(4654).Z,width:"896",height:"554"})),(0,r.kt)("div",{className:"admonition admonition-info alert alert--info"},(0,r.kt)("div",{parentName:"div",className:"admonition-heading"},(0,r.kt)("h5",{parentName:"div"},(0,r.kt)("span",{parentName:"h5",className:"admonition-icon"},(0,r.kt)("svg",{parentName:"span",xmlns:"http://www.w3.org/2000/svg",width:"14",height:"16",viewBox:"0 0 14 16"},(0,r.kt)("path",{parentName:"svg",fillRule:"evenodd",d:"M7 2.3c3.14 0 5.7 2.56 5.7 5.7s-2.56 5.7-5.7 5.7A5.71 5.71 0 0 1 1.3 8c0-3.14 2.56-5.7 5.7-5.7zM7 1C3.14 1 0 4.14 0 8s3.14 7 7 7 7-3.14 7-7-3.14-7-7-7zm1 3H6v5h2V4zm0 6H6v2h2v-2z"}))),"info")),(0,r.kt)("div",{parentName:"div",className:"admonition-content"},(0,r.kt)("p",{parentName:"div"},"Tip: The different web views ","(","such as the host view and the prompter",")"," can easily be transmitted over an SDI signal using the HTML producer in ",(0,r.kt)("a",{parentName:"p",href:"installation/installing-connections-and-additional-hardware/casparcg-server-installation"},"CasparCG"),"."))),(0,r.kt)("h3",{id:"modular-device-control"},"Modular Device Control"),(0,r.kt)("p",null,"Sofie controls playout devices ","(","such as vision and audio mixers, graphics and video playback",")"," via the Playout Gateway, using the ",(0,r.kt)("a",{parentName:"p",href:"concepts-and-architecture#timeline"},"Timeline"),".",(0,r.kt)("br",{parentName:"p"}),"\n","The Playout Gateway controls the devices and keeps track of their state and statuses, and lets the user know via the GUI if something's wrong that can affect the show."),(0,r.kt)("h3",{id:"state-based-playout"},(0,r.kt)("em",{parentName:"h3"},"State-based Playout")),(0,r.kt)("p",null,"Sofie is using a state-based architecture to control playout. This means that each element in the show can be programmed independently - there's no need to take into account what has happened previously in the show; Sofie will make sure that the video is loaded and that the audio fader is tuned to the correct position, no matter what was played out previously.",(0,r.kt)("br",{parentName:"p"}),"\n","This allows the producer to skip ahead or move backwards in a show, without the fear of things going wrong on air."),(0,r.kt)("h3",{id:"modular-data-ingest"},"Modular Data Ingest"),(0,r.kt)("p",null,"Sofie features a modular ingest data-flow, allowing multiple types of input data to base rundowns on. Currently there is support for ",(0,r.kt)("a",{parentName:"p",href:"http://mosprotocol.com"},"MOS-based")," systems such as ENPS and iNEWS, as well as ",(0,r.kt)("a",{parentName:"p",href:"installation/installing-a-gateway/rundown-or-newsroom-system-connection/installing-sofie-with-google-spreadsheet-support"},"Google Spreadsheets"),", and more is in development."),(0,r.kt)("h3",{id:"blueprints"},"Blueprints"),(0,r.kt)("p",null,"The ",(0,r.kt)("a",{parentName:"p",href:"concepts-and-architecture#blueprints"},"Blueprints")," are plugins to ",(0,r.kt)("em",{parentName:"p"},"Sofie"),", which allows for customization and tailor-made show designs.\nThe blueprints are made different depending on how the input data ","(","rundowns",")"," look like, how the show-design look like, and what devices to control."))}p.isMDXComponent=!0},5318:(e,t,a)=>{a.d(t,{Zo:()=>c,kt:()=>m});var n=a(7378);function r(e,t,a){return t in e?Object.defineProperty(e,t,{value:a,enumerable:!0,configurable:!0,writable:!0}):e[t]=a,e}function i(e,t){var a=Object.keys(e);if(Object.getOwnPropertySymbols){var n=Object.getOwnPropertySymbols(e);t&&(n=n.filter((function(t){return Object.getOwnPropertyDescriptor(e,t).enumerable}))),a.push.apply(a,n)}return a}function o(e){for(var t=1;t<arguments.length;t++){var a=null!=arguments[t]?arguments[t]:{};t%2?i(Object(a),!0).forEach((function(t){r(e,t,a[t])})):Object.getOwnPropertyDescriptors?Object.defineProperties(e,Object.getOwnPropertyDescriptors(a)):i(Object(a)).forEach((function(t){Object.defineProperty(e,t,Object.getOwnPropertyDescriptor(a,t))}))}return e}function s(e,t){if(null==e)return{};var a,n,r=function(e,t){if(null==e)return{};var a,n,r={},i=Object.keys(e);for(n=0;n<i.length;n++)a=i[n],t.indexOf(a)>=0||(r[a]=e[a]);return r}(e,t);if(Object.getOwnPropertySymbols){var i=Object.getOwnPropertySymbols(e);for(n=0;n<i.length;n++)a=i[n],t.indexOf(a)>=0||Object.prototype.propertyIsEnumerable.call(e,a)&&(r[a]=e[a])}return r}var l=n.createContext({}),d=function(e){var t=n.useContext(l),a=t;return e&&(a="function"==typeof e?e(t):o(o({},t),e)),a},c=function(e){var t=d(e.components);return n.createElement(l.Provider,{value:t},e.children)},u="mdxType",p={inlineCode:"code",wrapper:function(e){var t=e.children;return n.createElement(n.Fragment,{},t)}},h=n.forwardRef((function(e,t){var a=e.components,r=e.mdxType,i=e.originalType,l=e.parentName,c=s(e,["components","mdxType","originalType","parentName"]),u=d(a),h=r,m=u["".concat(l,".").concat(h)]||u[h]||p[h]||i;return a?n.createElement(m,o(o({ref:t},c),{},{components:a})):n.createElement(m,o({ref:t},c))}));function m(e,t){var a=arguments,r=t&&t.mdxType;if("string"==typeof e||r){var i=a.length,o=new Array(i);o[0]=h;var s={};for(var l in t)hasOwnProperty.call(t,l)&&(s[l]=t[l]);s.originalType=e,s[u]="string"==typeof e?e:r,o[1]=s;for(var d=2;d<i;d++)o[d]=a[d];return n.createElement.apply(null,o)}return n.createElement.apply(null,a)}h.displayName="MDXCreateElement"},4487:(e,t,a)=>{a.d(t,{Z:()=>n});const n=a.p+"assets/images/Sofie_GUI_example-412002c8561a9429322cc0a58e42bc56.jpg"},4877:(e,t,a)=>{a.d(t,{Z:()=>n});const n=a.p+"assets/images/host-view-fbb28fbe5efdccf095a31f8eafc2b50e.png"},4654:(e,t,a)=>{a.d(t,{Z:()=>n});const n=a.p+"assets/images/prompter-view-b5431da565a6d40cff2d2d2afdebe3a2.png"},2975:(e,t,a)=>{a.d(t,{Z:()=>n});const n=a.p+"assets/images/warnings-and-notifications-8bb3181e0398912914a12504a51512ba.png"}}]);