/* 小红书内容自动分类：标题 / 正文 / 标签 关键词打分 */
window.XHS = window.XHS || {};
(function (X) {
  'use strict';

  // 每个分类一组关键词（标签命中权重最高，其次标题，再次正文）
  var CATEGORIES = [
    { key:'food',        name:'美食',     emoji:'🍜', keywords:['美食','好吃','探店','餐厅','咖啡','奶茶','甜品','食谱','菜谱','做饭','烘焙','下厨','零食','火锅','烧烤','早餐','午餐','晚餐','brunch','吃货','料理','小吃','减脂餐','空气炸锅'] },
    { key:'travel',      name:'旅行',     emoji:'✈️', keywords:['旅行','旅游','攻略','打卡','景点','民宿','酒店','出行','自驾','机票','旅拍','citywalk','city walk','度假','露营','徒步','周边游','行程','穷游','签证'] },
    { key:'fashion',     name:'穿搭',     emoji:'👗', keywords:['穿搭','ootd','搭配','时尚','单品','显瘦','显高','通勤','叠穿','配饰','包包','鞋子','outfit','工装','美拉德','多巴胺穿搭','复古'] },
    { key:'beauty',      name:'美妆',     emoji:'💄', keywords:['美妆','化妆','彩妆','口红','粉底','眼影','妆容','底妆','腮红','睫毛','气垫','遮瑕','新手化妆','妆教','修容','美甲'] },
    { key:'skincare',    name:'护肤',     emoji:'🧴', keywords:['护肤','面膜','精华','水乳','防晒','保湿','美白','抗老','祛痘','护肤品','成分党','面霜','洁面','爽肤水','早c晚a'] },
    { key:'tech',        name:'数码',     emoji:'💻', keywords:['数码','手机','电脑','笔记本','相机','耳机','测评','开箱','键盘','显示器','ipad','iphone','安卓','智能','充电','配置','软件','app','装机','生产力工具'] },
    { key:'home',        name:'家居',     emoji:'🛋️', keywords:['家居','家装','装修','收纳','布置','改造','出租屋','宿舍','软装','家具','厨房','卫生间','卧室','客厅','租房','好物分享','ins风'] },
    { key:'fitness',     name:'健身',     emoji:'🏋️', keywords:['健身','减肥','瘦身','运动','跑步','瑜伽','普拉提','增肌','塑形','拉伸','马甲线','减脂','燃脂','训练','体态','开肩','核心'] },
    { key:'study',       name:'学习',     emoji:'📚', keywords:['学习','考研','考试','笔记','效率','备考','英语','背单词','刷题','留学','学霸','自律','计划表','时间管理','复习','上岸','四六级','雅思','托福'] },
    { key:'career',      name:'职场',     emoji:'💼', keywords:['职场','工作','面试','简历','求职','副业','offer','实习','跳槽','涨薪','技能','ppt','excel','汇报','打工','创业','搞钱','远程办公'] },
    { key:'parenting',   name:'母婴',     emoji:'🍼', keywords:['母婴','宝宝','育儿','辅食','怀孕','孕期','奶粉','婴儿','早教','带娃','亲子','幼儿','宝妈'] },
    { key:'pets',        name:'宠物',     emoji:'🐱', keywords:['宠物','猫咪','狗狗','养猫','养狗','铲屎官','猫粮','狗粮','宠物用品','仓鼠','布偶','柯基','喵星人'] },
    { key:'photography', name:'摄影',     emoji:'📷', keywords:['摄影','拍照','修图','构图','调色','人像','胶片','拍照姿势','滤镜','lightroom','出片','后期','光影'] },
    { key:'reading',     name:'读书观影', emoji:'🎬', keywords:['读书','书单','看书','电影','电视剧','观后感','纪录片','追剧','书评','影评','好剧','综艺','名著'] },
    { key:'emotion',     name:'情感',     emoji:'💗', keywords:['情感','恋爱','分手','脱单','婚姻','相处','治愈','文案','心情','日记','成长','emo','心理','自愈','语录'] },
    { key:'finance',     name:'理财',     emoji:'💰', keywords:['理财','存钱','基金','省钱','记账','攒钱','投资','存款','财务自由','省钱攻略','工资','负债'] }
  ];
  var OTHER = { key:'other', name:'其他', emoji:'🗂️' };

  // 分类显示名英译（仅显示层；存储的 note.category 始终是中文 name，不动）
  var CAT_EN = {
    '美食':'Food', '旅行':'Travel', '穿搭':'Fashion', '美妆':'Beauty', '护肤':'Skincare',
    '数码':'Tech', '家居':'Home', '健身':'Fitness', '学习':'Study', '职场':'Career',
    '母婴':'Parenting', '宠物':'Pets', '摄影':'Photography', '读书观影':'Books & Film',
    '情感':'Emotions', '理财':'Finance', '其他':'Other'
  };
  function catLabel(name){
    var en = CAT_EN[name];
    return (X.i18n && X.i18n.lang === 'en' && en) ? en : name;
  }

  function norm(s){ return (s == null ? '' : String(s)).toLowerCase(); }

  // 返回 { primary, ranked } —— primary 为得分最高的分类
  function classify(note){
    var title = norm(note.title);
    var body  = norm(note.body);
    var tagStr = (note.tags || []).map(norm).join(' ');

    var scored = CATEGORIES.map(function (c) {
      var score = 0, hits = [];
      c.keywords.forEach(function (kw) {
        var k = kw.toLowerCase();
        if (tagStr.indexOf(k) !== -1)      { score += 3; hits.push(kw); }
        else if (title.indexOf(k) !== -1)  { score += 2; hits.push(kw); }
        else if (body.indexOf(k) !== -1)   { score += 1; hits.push(kw); }
      });
      return { key:c.key, name:c.name, emoji:c.emoji, score:score, hits:Array.from(new Set(hits)) };
    }).filter(function (c) { return c.score > 0; })
      .sort(function (a, b) { return b.score - a.score; });

    return { primary: scored.length ? scored[0] : OTHER, ranked: scored };
  }

  X.CATEGORIES = CATEGORIES;
  X.OTHER = OTHER;
  X.classify = classify;
  X.catLabel = catLabel;
})(window.XHS);
