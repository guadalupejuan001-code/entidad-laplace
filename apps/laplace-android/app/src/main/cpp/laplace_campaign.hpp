#pragma once
#include "laplace_temporal.hpp"
#include <fstream>

namespace mundo_x { namespace laplace {
// C02: the connected exact circuit is retained; a small regularized readout
// replaces thousands of freely fitted readout coefficients on a short sample.
constexpr std::size_t campaign_dims=54;
using CampaignVector=std::array<double,campaign_dims>;
struct CampaignExample {Example native;CampaignVector raw{};std::array<double,4> encoder_prediction{};};
inline CampaignVector campaign_features(const Model& encoder,const TemporalCircuit& circuit,const Dataset& data,const Example& e){
 CampaignVector x{};std::vector<double> z;auto native_prediction=encoder.forward(circuit,e,&z);
 const std::array<std::size_t,9> cuts={0,100,150,175,188,194,197,199,200};
 for(std::size_t group=0;group<8;group++)for(std::size_t feature=0;feature<5;feature++){
  double sum=0;for(std::size_t t=cuts[group];t<cuts[group+1];t++)sum+=z[t*5+feature];
  x[group*5+feature]=sum/std::sqrt(double(cuts[group+1]-cuts[group]));
 }
 auto i=e.origin;const auto& bars=data.bars;double rms=std::max(.0001,e.return_scale/std::sqrt(double(data.config.horizon)));
 for(std::size_t k=0;k<6;k++){int lag=std::array<int,6>{1,3,6,12,24,48}[k];x[40+k]=clip(std::log(bars[i].close/bars[i-lag].close)/(rms*std::sqrt(double(lag))),-6,6);}
 double short_square=0,short_volume=0,long_volume=0,lo=bars[i].low,hi=bars[i].high;
 for(std::size_t j=i-23;j<=i;j++){long_volume+=bars[j].volume;lo=std::min(lo,bars[j].low);hi=std::max(hi,bars[j].high);if(j>i-6){double r=std::log(bars[j].close/bars[j-1].close);short_square+=r*r;short_volume+=bars[j].volume;}}
 x[46]=clip(std::log((std::sqrt(short_square/6)+1e-6)/(rms+1e-6)),-4,4);
 x[47]=clip(std::log((short_volume+1e-6)/(long_volume/4+1e-6)),-4,4);
 x[48]=clip(std::log(bars[i].high/bars[i].low)/rms,0,8);
 x[49]=hi>lo?2*(bars[i].close-lo)/(hi-lo)-1:0;
 x[50]=std::sin(2*3.141592653589793*std::fmod(e.time,86400.)/86400.);
 x[51]=std::cos(2*3.141592653589793*std::fmod(e.time,86400.)/86400.);
 x[52]=native_prediction[0];x[53]=1;return x;
}
inline std::vector<Example> campaign_collect(const Dataset& data,std::size_t begin,std::size_t end,std::size_t cap){
 std::vector<std::size_t> origins;for(std::size_t i=std::max(begin,history+24);i+data.config.horizon<end;i+=data.config.horizon)if(data.valid(i,true))origins.push_back(i);
 std::vector<Example> out;auto n=std::min(cap,origins.size());for(std::size_t k=0;k<n;k++)out.push_back(data.make(origins[n<origins.size()?(k*(origins.size()-1)/std::max(std::size_t(1),n-1)):k]));return out;
}
inline CampaignVector campaign_solve(std::array<CampaignVector,campaign_dims> a,CampaignVector b){
 for(std::size_t i=0;i<campaign_dims;i++){
  std::size_t pivot=i;for(std::size_t j=i+1;j<campaign_dims;j++)if(std::abs(a[j][i])>std::abs(a[pivot][i]))pivot=j;
  require(std::abs(a[pivot][i])>1e-12,"Campaign: singular readout");if(pivot!=i){std::swap(a[i],a[pivot]);std::swap(b[i],b[pivot]);}
  double diagonal=a[i][i];for(std::size_t k=i;k<campaign_dims;k++)a[i][k]/=diagonal;b[i]/=diagonal;
  for(std::size_t j=0;j<campaign_dims;j++)if(j!=i){double factor=a[j][i];for(std::size_t k=i;k<campaign_dims;k++)a[j][k]-=factor*a[i][k];b[j]-=factor*b[i];}
 }return b;
}
struct CampaignReadout {
 CampaignVector weights{};double lambda=1,blend=1,native_blend=1;int family=0;
};
struct CampaignModel {
 Model encoder;CampaignVector mean{},scale{};CampaignReadout selected;
 double prior=.5,magnitude=1,temperature=1,initial_through=0,cursor=0;std::size_t online_updates=0,train_cases=0,validation_cases=0,calibration_cases=0,candidates=0;
 Metrics test,reference_test;std::array<double,3> lower{},upper{};double validation_accuracy=0,prior_validation_accuracy=0,accepted_threshold=.5;std::size_t accepted_cases=0,accepted_correct=0;
 CampaignVector normalize(const CampaignVector& raw,int family)const{CampaignVector x{};for(std::size_t k=0;k<52;k++)x[k]=(family==0||k<40)?clip((raw[k]-mean[k])/scale[k],-6,6):0;x[53]=1;return x;}
 double probability(const CampaignVector& raw)const{
  if(selected.family==2)return prior;
  auto x=normalize(raw,selected.family);double score=0;for(std::size_t k=0;k<campaign_dims;k++)score+=selected.weights[k]*x[k];
  double pooled=selected.blend*sigmoid(score/temperature)+(1-selected.blend)*prior;
  return clip(selected.native_blend*pooled+(1-selected.native_blend)*sigmoid(raw[52]/temperature),1e-9,1-1e-9);
 }
 std::array<double,4> predict(const TemporalCircuit& c,const CampaignExample& e)const{
  auto p=e.encoder_prediction;p[0]=magnitude*(2*probability(e.raw)-1);p[3]=std::log(probability(e.raw)/(1-probability(e.raw)));return p;
 }
 Metrics evaluate(const TemporalCircuit& c,const std::vector<CampaignExample>& examples)const{
  Metrics out;out.cases=examples.size();double average=0,squared=0;std::size_t count=0;
  for(const auto& e:examples){auto p=predict(c,e);auto actual=e.native.actual;auto y=encoder.decode(e.native,p);double probability_up=probability(e.raw),d=probability_up-e.native.target[3];
   out.brier+=d*d/examples.size();out.direction_correct+=((y[0]>e.native.reference)==(actual[0]>e.native.reference))&&y[0]!=e.native.reference&&actual[0]!=e.native.reference;
   out.predicted_up+=y[0]>e.native.reference;out.predicted_down+=y[0]<e.native.reference;out.actual_up+=e.native.target[3]>0;out.probability_correct+=(probability_up>.5)==(e.native.target[3]>0);
   out.probability_min=std::min(out.probability_min,probability_up);out.probability_max=std::max(out.probability_max,probability_up);
   ++count;double delta=p[0]-average;average+=delta/count;squared+=delta*(p[0]-average);
   std::array<double,3> base={e.native.reference,e.native.volatility_base,e.native.volume_base};
   for(std::size_t k=0;k<3;k++){out.mae[k]+=std::abs(y[k]-actual[k])/examples.size();out.baseline_mae[k]+=std::abs(base[k]-actual[k])/examples.size();out.coverage[k]+=(e.native.target[k]>=p[k]+lower[k]&&e.native.target[k]<=p[k]+upper[k])?1./examples.size():0;}
  }out.normalized_price_sd=std::sqrt(std::max(0.,squared/examples.size()));return out;
 }
 std::string save()const{
  std::string native=encoder.save();std::ostringstream out;out<<std::setprecision(17)<<"LQC3 3\n"<<native.size()<<'\n'<<native;
  out<<prior<<' '<<magnitude<<' '<<temperature<<' '<<initial_through<<' '<<cursor<<' '<<online_updates<<' '<<train_cases<<' '<<validation_cases<<' '<<calibration_cases<<' '<<candidates<<' '<<selected.family<<' '<<selected.lambda<<' '<<selected.blend<<' '<<selected.native_blend<<' '<<validation_accuracy<<' '<<prior_validation_accuracy<<' '<<accepted_threshold<<' '<<accepted_cases<<' '<<accepted_correct<<'\n';
  auto array=[&](const auto& a){for(auto x:a)out<<x<<' ';out<<'\n';};array(mean);array(scale);array(selected.weights);array(lower);array(upper);
  auto metrics=[&](const Metrics& t){out<<t.cases<<' '<<t.direction_correct<<' '<<t.brier<<' '<<t.predicted_up<<' '<<t.predicted_down<<' '<<t.actual_up<<' '<<t.probability_correct<<' '<<t.probability_min<<' '<<t.probability_max<<' '<<t.normalized_price_sd<<'\n';array(t.mae);array(t.baseline_mae);array(t.coverage);};metrics(test);metrics(reference_test);return out.str();
 }
 static CampaignModel restore(const std::string& saved,const Config& config,bool mode){
  require(saved.size()<900*1024,"Campaign: checkpoint too large");std::istringstream input(saved);std::string magic;int version;std::size_t length;
  input>>magic>>version>>length;require(magic=="LQC3"&&version==3&&length<768*1024,"Campaign: checkpoint version");input.get();std::string native(length,' ');input.read(&native[0],length);require(std::size_t(input.gcount())==length,"Campaign: truncated encoder");
  CampaignModel m;m.encoder=Model::restore(native,config,mode);
  input>>m.prior>>m.magnitude>>m.temperature>>m.initial_through>>m.cursor>>m.online_updates>>m.train_cases>>m.validation_cases>>m.calibration_cases>>m.candidates>>m.selected.family>>m.selected.lambda>>m.selected.blend>>m.selected.native_blend>>m.validation_accuracy>>m.prior_validation_accuracy>>m.accepted_threshold>>m.accepted_cases>>m.accepted_correct;
  auto array=[&](auto& a){for(auto& x:a){input>>x;require(bool(input)&&std::isfinite(x),"Campaign: malformed checkpoint");}};array(m.mean);array(m.scale);array(m.selected.weights);array(m.lower);array(m.upper);
  auto metrics=[&](Metrics& t){input>>t.cases>>t.direction_correct>>t.brier>>t.predicted_up>>t.predicted_down>>t.actual_up>>t.probability_correct>>t.probability_min>>t.probability_max>>t.normalized_price_sd;array(t.mae);array(t.baseline_mae);array(t.coverage);};metrics(m.test);metrics(m.reference_test);
  std::string trailing;require(bool(input)&&!(input>>trailing),"Campaign: trailing checkpoint");
  require(m.prior>0&&m.prior<1&&m.magnitude>=0&&m.magnitude<=10&&m.temperature>=.5&&m.temperature<=4&&m.selected.family>=0&&m.selected.family<=2&&m.selected.blend>=0&&m.selected.blend<=1&&m.selected.native_blend>=0&&m.selected.native_blend<=1,"Campaign: invalid selection");
  require(m.initial_through<=config.asof&&m.initial_through>0&&m.cursor<config.asof&&m.cursor>0&&m.train_cases>=64&&m.validation_cases>=8&&m.calibration_cases>=12&&m.test.cases>=8&&m.test.cases<=256&&m.test.direction_correct<=m.test.cases&&m.test.predicted_up<=m.test.cases&&m.test.predicted_down<=m.test.cases&&m.test.predicted_up+m.test.predicted_down<=m.test.cases,"Campaign: invalid chronology/counts");
  for(auto x:m.scale)require(x>=.001&&x<=1000,"Campaign: invalid scale");for(auto x:m.selected.weights)require(std::abs(x)<1000,"Campaign: invalid weight");
  require(m.candidates==216&&m.train_cases<=512&&m.validation_cases<=128&&m.calibration_cases<=128&&m.initial_through==m.encoder.initial_through&&m.validation_accuracy>=0&&m.validation_accuracy<=1&&m.prior_validation_accuracy>=0&&m.prior_validation_accuracy<=1&&m.accepted_cases<=m.test.cases&&m.accepted_correct<=m.accepted_cases,"Campaign: invalid evidence");
  for(const Metrics* t:{&m.test,&m.reference_test}){
   require(t->cases==m.test.cases&&t->direction_correct<=t->cases&&t->predicted_up<=t->cases&&t->predicted_down<=t->cases&&t->predicted_up+t->predicted_down<=t->cases&&t->actual_up<=t->cases&&t->probability_correct<=t->cases&&t->brier>=0&&t->brier<=1&&t->probability_min>0&&t->probability_max<1&&t->probability_min<=t->probability_max&&t->normalized_price_sd>=0,"Campaign: invalid metrics");
   for(std::size_t k=0;k<3;k++)require(t->mae[k]>=0&&t->baseline_mae[k]>=0&&t->coverage[k]>=0&&t->coverage[k]<=1.00000001&&m.lower[k]<=m.upper[k],"Campaign: invalid intervals");
  }
  return m;
 }
};
inline std::vector<CampaignExample> campaign_prepare(const Dataset& d,const Model& encoder,const TemporalCircuit& circuit,std::size_t begin,std::size_t end,std::size_t cap){
 std::vector<CampaignExample> out;for(auto e:campaign_collect(d,begin,end,cap))out.push_back({e,campaign_features(encoder,circuit,d,e),encoder.forward(circuit,e)});return out;
}
inline CampaignReadout campaign_fit_readout(const CampaignModel& model,const std::vector<CampaignExample>& train,double lambda,int family){
 CampaignReadout r;r.lambda=lambda;r.family=family;r.weights[53]=std::log(model.prior/(1-model.prior));
 for(int iteration=0;iteration<12;iteration++){
  std::array<CampaignVector,campaign_dims> hessian{};CampaignVector gradient{};
  for(const auto& e:train){auto x=model.normalize(e.raw,family);double score=0;for(std::size_t k=0;k<campaign_dims;k++)score+=r.weights[k]*x[k];double p=sigmoid(score),w=std::max(.001,p*(1-p));
   for(std::size_t i=0;i<campaign_dims;i++){gradient[i]+=(p-e.native.target[3])*x[i]/train.size();for(std::size_t j=0;j<=i;j++)hessian[i][j]+=w*x[i]*x[j]/train.size();}
  }
  for(std::size_t i=0;i<campaign_dims;i++){for(std::size_t j=0;j<i;j++)hessian[j][i]=hessian[i][j];double penalty=i==53?.0001:lambda;gradient[i]+=penalty*r.weights[i];hessian[i][i]+=penalty+1e-8;}
  auto step=campaign_solve(hessian,gradient);double largest=0;for(std::size_t i=0;i<campaign_dims;i++){r.weights[i]-=clip(step[i],-1,1);largest=std::max(largest,std::abs(step[i]));}if(largest<1e-6)break;
 }return r;
}
inline CampaignModel campaign_fit(const Dataset& d,bool quantum=true){
 const auto n=d.bars.size();auto native_val=d.collect(n*60/100,n*75/100,64);Model encoder;double best=std::numeric_limits<double>::infinity();
 for(int lag:{0,3,12}){TemporalCircuit c(wires,channels,lag);auto candidate=fit_candidate(d,c,quantum);double loss=candidate.validation_loss(c,native_val);if(loss<best){best=loss;encoder=candidate;}}
 TemporalCircuit circuit(wires,channels,encoder.lag);calibrate_and_test(encoder,d,circuit);
 CampaignModel model;model.encoder=encoder;
 auto train=campaign_prepare(d,encoder,circuit,0,n*60/100,512),val=campaign_prepare(d,encoder,circuit,n*60/100,n*75/100,128);
 require(train.size()>=64&&val.size()>=8,"Campaign: insufficient mature train/validation cases");
 model.train_cases=train.size();model.validation_cases=val.size();double up=1,absolute=0;
 for(const auto& e:train){up+=e.native.target[3];absolute+=std::abs(e.native.target[0]);for(std::size_t k=0;k<53;k++)model.mean[k]+=e.raw[k]/train.size();}
 model.prior=up/(train.size()+2);model.magnitude=clip(absolute/train.size(),0,10);
 for(const auto& e:train)for(std::size_t k=0;k<53;k++){double delta=e.raw[k]-model.mean[k];model.scale[k]+=delta*delta/train.size();}
 for(std::size_t k=0;k<53;k++)model.scale[k]=std::max(.001,std::sqrt(model.scale[k]));model.scale[53]=1;
 best=std::numeric_limits<double>::infinity();CampaignReadout winner;double best_temperature=1;
 std::size_t majority=0;for(const auto& e:val)majority+=(model.prior>.5)==(e.native.target[3]>0);model.prior_validation_accuracy=double(majority)/val.size();
 // Grid and objective are fixed before the later calibration and test blocks.
 for(int family:{0,1})for(double lambda:{.1,1.,10.,100.}){
  auto fitted=campaign_fit_readout(model,train,lambda,family);
  for(double blend:{.5,.75,1.})for(double temperature:{1.,2.,4.})for(double native_blend:{0.,.5,1.}){
   model.selected=fitted;model.selected.blend=blend;model.selected.native_blend=native_blend;model.temperature=temperature;auto score=model.evaluate(circuit,val);model.candidates++;
   double objective=1-double(score.direction_correct)/score.cases+.1*score.brier+.025*score.mae[0]/std::max(1e-8,score.baseline_mae[0]);
   if(objective<best){best=objective;winner=model.selected;model.validation_accuracy=double(score.direction_correct)/score.cases;best_temperature=temperature;}
  }
 }
 model.selected=winner;model.temperature=best_temperature;
 auto calibration=campaign_prepare(d,encoder,circuit,n*75/100,n*85/100,128),test=campaign_prepare(d,encoder,circuit,n*85/100,n,256);
 require(calibration.size()>=12&&test.size()>=8,"Campaign: insufficient independent calibration/test cases");
 std::array<std::vector<double>,3> residuals;for(const auto& e:calibration){auto p=model.predict(circuit,e);for(std::size_t k=0;k<3;k++)residuals[k].push_back(e.native.target[k]-p[k]);}
 for(std::size_t k=0;k<3;k++){model.lower[k]=quantile(residuals[k],.1);model.upper[k]=quantile(residuals[k],.9);}model.calibration_cases=calibration.size();model.test=model.evaluate(circuit,test);
 std::vector<Example> paired;for(const auto& e:test)paired.push_back(e.native);model.reference_test=model.encoder.evaluate(circuit,paired);
 // Confidence threshold uses validation only; full-coverage test stays visible.
 model.accepted_threshold=.5;for(double threshold:{.5,.55,.6,.65}){std::size_t count=0,correct=0;for(const auto& e:val){double p=model.probability(e.raw);if(std::max(p,1-p)>=threshold){count++;correct+=(p>.5)==(e.native.target[3]>0);}}
  if(count>=24&&double(count)/val.size()>=.25&&double(correct)/count>=.6){model.accepted_threshold=threshold;break;}}
 for(const auto& e:test){double p=model.probability(e.raw);if(std::max(p,1-p)>=model.accepted_threshold){model.accepted_cases++;model.accepted_correct+=(p>.5)==(e.native.target[3]>0);}}
 model.initial_through=d.bars.back().time+d.config.granularity;model.cursor=d.bars.back().time-d.config.horizon*d.config.granularity;return model;
}
class CampaignXiRuntime {
 public:
 std::string execute(const std::string& program,const std::string& checkpoint="")const{
  require(program.size()<=2*1024*1024,"Campaign: program too large");Config config;std::vector<Candle> rows;std::istringstream in(program);std::string line;bool configured=false,run=false,mode=true;
  while(std::getline(in,line)){if(line.empty()||line[0]=='#')continue;require(!run,"Campaign: command after run");std::istringstream tokens(line);std::string op;tokens>>op;
   if(op=="lqc.configure"){std::string market,kind;require(!configured&&rows.empty(),"Campaign: duplicate configuration");tokens>>config.asset>>config.granularity>>config.horizon>>market>>config.asof>>kind;require(bool(tokens)&&(market=="crypto"||market=="equity")&&(kind=="quantum"||kind=="classical"),"Campaign: invalid configuration");config.equity=market=="equity";mode=kind=="quantum";configured=true;}
   else if(op=="lqc.candle"){require(configured&&rows.size()<8640,"Campaign: candle limit");Candle c;tokens>>c.time>>c.low>>c.high>>c.open>>c.close>>c.volume>>c.session;require(bool(tokens),"Campaign: malformed candle");rows.push_back(c);}
   else if(op=="lqc.run"){require(configured,"Campaign: configuration missing");run=true;}else throw std::invalid_argument("Campaign: unknown XI instruction");std::string rest;require(!(tokens>>rest),"Campaign: trailing arguments");}
  require(run,"Campaign: run missing");auto started=std::chrono::steady_clock::now();Dataset data(config,rows);require(rows.back().time+config.granularity*(config.horizon+1)>config.asof,"LQT: future period already expired; refresh candles");
  CampaignModel model=checkpoint.empty()?campaign_fit(data,mode):CampaignModel::restore(checkpoint,config,mode);TemporalCircuit circuit(wires,channels,model.encoder.lag);
  std::size_t online=0;
  if(!checkpoint.empty())for(std::size_t i=history+24;i+config.horizon<rows.size();i++){
   if(rows[i].time<model.cursor+config.horizon*config.granularity||!data.valid(i,true))continue;require(rows[i].time+config.granularity>=model.initial_through,"Campaign: held-out labels cannot train online");
   auto e=data.make(i);auto raw=campaign_features(model.encoder,circuit,data,e);auto x=model.normalize(raw,model.selected.family);double probability=model.probability(raw),logit=0;for(std::size_t k=0;k<campaign_dims;k++)logit+=model.selected.weights[k]*x[k];double unblended=sigmoid(logit/model.temperature);
   double gradient=clip((probability-e.target[3])*model.selected.native_blend*model.selected.blend*unblended*(1-unblended)/(model.temperature*probability*(1-probability)),-1,1);
   if(model.selected.native_blend>0){for(std::size_t k=0;k<campaign_dims;k++)model.selected.weights[k]-=.005*(gradient*x[k]+(k==53?0:.01*model.selected.weights[k]));model.online_updates++;online++;}model.cursor=rows[i].time;
  }
  auto current=data.make(rows.size()-1,false);CampaignExample e{current,campaign_features(model.encoder,circuit,data,current),model.encoder.forward(circuit,current)};auto p=model.predict(circuit,e);auto values=model.encoder.decode(current,p);
  std::ostringstream out;out<<std::setprecision(17)<<"{\"schema\":\"laplace-lqt1000-v1\",\"model\":\"LQC-3\",\"algorithmVersion\":3,\"asset\":"<<quoted(config.asset)<<",\"market\":"<<quoted(config.equity?"equity":"crypto")<<",\"granularity\":"<<config.granularity<<",\"horizonBars\":"<<config.horizon<<",\"originTime\":"<<rows.back().time<<",\"sourceCloseAt\":"<<rows.back().time+config.granularity<<",\"targetCloseAt\":"<<(config.equity?"null":std::to_string(std::int64_t(rows.back().time+config.granularity*(config.horizon+1))))<<",\"reference\":"<<current.reference
   <<",\"qubits\":1000,\"components\":"<<(mode?1:1000)<<",\"graphEdges\":"<<(mode?circuit.edges():0)<<",\"trainableRotations\":1000,\"updatedRotations\":"<<std::count_if(model.encoder.changed.begin(),model.encoder.changed.end(),[](auto n){return n>0;})<<",\"quantum\":"<<(mode?"true":"false")<<",\"nativeXI\":true,\"mps\":false,\"physicalQPU\":false,\"updates\":"<<model.encoder.updates+model.online_updates<<",\"onlineUpdates\":"<<online<<",\"initialUpdates\":"<<model.encoder.initial_updates<<",\"selectedTemporalLag\":"<<model.encoder.lag<<",\"initialTestThrough\":"<<model.initial_through<<",\"validationCases\":"<<model.validation_cases<<",\"calibrationCases\":"<<model.calibration_cases<<",\"nativeMilliseconds\":"<<std::chrono::duration<double,std::milli>(std::chrono::steady_clock::now()-started).count()
   <<",\"probabilityUp\":"<<model.probability(e.raw)<<",\"test\":"<<metrics_json(model.test)<<",\"referenceTest\":"<<metrics_json(model.reference_test)<<",\"campaign\":{\"candidates\":"<<model.candidates<<",\"trainCases\":"<<model.train_cases<<",\"readoutFeatures\":"<<(model.selected.family==0?52:40)<<",\"regularization\":"<<model.selected.lambda<<",\"blend\":"<<model.selected.blend<<",\"pooledWeight\":"<<model.selected.native_blend<<",\"validationAccuracy\":"<<model.validation_accuracy<<",\"referenceValidationAccuracy\":"<<model.prior_validation_accuracy<<",\"acceptedThreshold\":"<<model.accepted_threshold<<",\"acceptedCases\":"<<model.accepted_cases<<",\"acceptedCorrect\":"<<model.accepted_correct<<",\"onlineLearning\":\"readout only; circuit frozen after initial campaign\"},\"outputs\":[";
  std::array<double,3> base={current.reference,current.volatility_base,current.volume_base};for(std::size_t k=0;k<3;k++){if(k)out<<',';auto lo=p,hi=p;lo[k]+=model.lower[k];hi[k]+=model.upper[k];out<<"{\"predicted\":"<<values[k]<<",\"baseline\":"<<base[k]<<",\"lower\":"<<model.encoder.decode(current,lo)[k]<<",\"upper\":"<<model.encoder.decode(current,hi)[k]<<'}';}
  out<<"],\"checkpoint\":"<<quoted(model.save())<<",\"automaticTrading\":false,\"prospectivelyValidated\":false}";return out.str();
 }
};
}}
