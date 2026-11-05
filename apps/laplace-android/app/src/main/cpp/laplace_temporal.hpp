#pragma once
// LQT-1000 v1, a bounded-circuit representation added to the user's Ether
// kernel. No external quantum library, MPS, small-register decomposition or
// claim of a general 1000-wire state-vector simulator.
#include "mundo_x/compact_core.hpp"
#include <algorithm>
#include <array>
#include <chrono>
#include <cmath>
#include <cstdint>
#include <iomanip>
#include <limits>
#include <numeric>
#include <random>
#include <sstream>
#include <stdexcept>
#include <string>
#include <vector>

namespace mundo_x { namespace laplace {
constexpr std::size_t wires=1000, channels=5, history=200, heads=4;
constexpr double root_n=31.622776601683793;
inline void require(bool ok,const char* message){if(!ok)throw std::invalid_argument(message);}
inline double clip(double x,double a,double b){return std::max(a,std::min(b,x));}
inline double sigmoid(double x){return 1/(1+std::exp(-clip(x,-25,25)));}
inline double quantile(std::vector<double> x,double p){
 require(!x.empty(),"LQT: empty calibration");std::sort(x.begin(),x.end());
 double at=p*(x.size()-1);auto i=std::size_t(at);return x[i]+(x[std::min(i+1,x.size()-1)]-x[i])*(at-i);
}
inline std::string quoted(const std::string& value){
 std::ostringstream out;out<<'"';for(unsigned char c:value){
  if(c=='"'||c=='\\')out<<'\\'<<c;else if(c=='\n')out<<"\\n";
  else if(c=='\r')out<<"\\r";else if(c=='\t')out<<"\\t";
  else if(c<32)throw std::invalid_argument("LQT: control character");else out<<c;
 }out<<'"';return out.str();
}
struct Candle {double time,low,high,open,close,volume,session;};
struct Config {std::string asset;int granularity=300,horizon=3;bool equity=false;double asof=0;};
inline bool allowed_asset(const std::string& asset){
 static const std::string all="|BTC-USD|ETH-USD|SOL-USD|DOGE-USD|XRP-USD|ADA-USD|LTC-USD|LINK-USD|AVAX-USD|BCH-USD|AAPL|NVDA|TSLA|AMD|MSFT|AMZN|GOOGL|META|PLTR|HOOD|COIN|MSTR|SOFI|NFLX|JPM|SPY|QQQ|DIA|IWM|VOO|VTI|";
 return all.find("|"+asset+"|")!=std::string::npos;
}

// |psi(x,theta)> = (product RY(theta_i)) CZ_G (product RY(a_i)) |0^n>.
// The Clifford authority is the ORIGINAL CompactCore. Its packed generators
// give C X_i C^dagger = X_i product_(j in N(i)) Z_j. We contract the two
// Heisenberg terms of each Z_i measurement against the input rotations:
// <Z_i> = cos(theta_i) cos(a_i) - sin(theta_i) sin(a_i) product cos(a_j).
// This formula is exact for this ansatz, not an approximation of an arbitrary
// circuit. The full graph is connected; no independent four-wire registers.
class TemporalCircuit {
 public:
  explicit TemporalCircuit(std::size_t n=wires,std::size_t width=channels,int lag=0)
    : backbone_(n),neighbors_(n),n_(n),lag_(lag){
   require(n>=2&&n<=wires&&width>=1&&width<=n,"LQT: circuit dimensions");
   require(lag==0||lag==3||lag==12,"LQT: temporal lag");
   for(std::size_t i=0;i<n;i++)backbone_.hadamard(i);
   for(std::size_t i=0;i<n;i++){
    if(i%width+1<width&&i+1<n)backbone_.controlled_z(i,i+1);
    if(i+width<n)backbone_.controlled_z(i,i+width);
    if(lag>1&&i+width*lag<n)backbone_.controlled_z(i,i+width*lag);
   }
   // The neighbors used by inference come from Ether, not a second graph.
   for(std::size_t i=0;i<n;i++){
    auto g=backbone_.generator_packed(i);require(g.phase==0,"LQT: graph phase");
    for(std::size_t j=0;j<n;j++){
     bool x=(g.x[j/64]>>(j%64))&1,z=(g.z[j/64]>>(j%64))&1;
     require(x==(i==j),"LQT: invalid graph generator");
     if(z)neighbors_[i].push_back(j);
    }
   }
   std::vector<bool> seen(n);std::vector<std::size_t> todo{0};seen[0]=true;
   for(std::size_t p=0;p<todo.size();p++)for(auto j:neighbors_[todo[p]])if(!seen[j]){seen[j]=true;todo.push_back(j);}
   require(todo.size()==n,"LQT: disconnected register");
  }
  const std::vector<std::size_t>& neighbors(std::size_t i)const{return neighbors_.at(i);}
  const CompactCore& backbone()const{return backbone_;}
  int lag()const{return lag_;}
  std::size_t edges()const{std::size_t out=0;for(const auto& v:neighbors_)out+=v.size();return out/2;}
  std::size_t payload_bytes()const{
   std::size_t out=backbone_.state_bytes();for(const auto& n:neighbors_)out+=n.size()*sizeof(std::size_t);return out;
  }
  void basis(const std::vector<double>& angles,std::vector<double>& a,std::vector<double>& b,bool quantum=true)const{
   require(angles.size()==n_,"LQT: input dimensions");a.resize(n_);b.resize(n_);
   for(std::size_t i=0;i<n_;i++){
    require(std::isfinite(angles[i]),"LQT: nonfinite input");a[i]=std::cos(angles[i]);b[i]=std::sin(angles[i]);
   }
   if(quantum)for(std::size_t i=0;i<n_;i++)for(auto j:neighbors_[i])b[i]*=a[j];
  }
  void observe(const std::vector<double>& angles,const std::vector<double>& theta,
               std::vector<double>& values,std::vector<double>* derivatives=nullptr,bool quantum=true)const{
   require(angles.size()==n_&&theta.size()==n_,"LQT: rotation dimensions");
   std::vector<double> ca(n_),sa(n_);values.resize(n_);if(derivatives)derivatives->resize(n_);
   for(std::size_t i=0;i<n_;i++){
    require(std::isfinite(angles[i])&&std::isfinite(theta[i]),"LQT: nonfinite rotation");
    ca[i]=std::cos(angles[i]);sa[i]=std::sin(angles[i]);
   }
   for(std::size_t i=0;i<n_;i++){
    double factor=1;if(quantum)for(auto j:neighbors_[i])factor*=ca[j];
    const double c=std::cos(theta[i]),s=std::sin(theta[i]);
    values[i]=c*ca[i]-s*sa[i]*factor;
    if(derivatives)(*derivatives)[i]=-s*ca[i]-c*sa[i]*factor;
   }
  }
 private:CompactCore backbone_;std::vector<std::vector<std::size_t>> neighbors_;std::size_t n_;int lag_;
};

struct Example {
 std::size_t origin;double time,reference,return_scale,volatility_base,volume_base;
 std::vector<double> angles;std::array<double,4> target{};std::array<double,3> actual{};
};
class Dataset {
 public:
  Config config;std::vector<Candle> bars;std::vector<int> gaps;
  Dataset(Config c,std::vector<Candle> b):config(std::move(c)),bars(std::move(b)){
   require(allowed_asset(config.asset),"LQT: unsupported asset");
   require(config.equity==(config.asset.find("-USD")==std::string::npos),"LQT: asset market mismatch");
   require(config.granularity==300||config.granularity==3600||config.granularity==86400,"LQT: resolution");
   require(config.horizon>=1&&config.horizon<=1500,"LQT: horizon");
   require(bars.size()>=400&&bars.size()<=8640,"LQT: need 400..8640 closed candles");
   require(std::isfinite(config.asof)&&config.asof>0,"LQT: as-of missing");
   gaps.resize(bars.size());
   for(std::size_t i=0;i<bars.size();i++){
    const auto& x=bars[i];for(double v:{x.time,x.low,x.high,x.open,x.close,x.volume,x.session})require(std::isfinite(v),"LQT: nonfinite candle");
    require(x.time>0&&x.time==std::floor(x.time)&&std::fmod(x.time,config.granularity)==0&&x.low>0&&x.high>=x.low&&x.open>=x.low&&x.open<=x.high&&x.close>=x.low&&x.close<=x.high&&x.volume>=0,"LQT: invalid OHLCV");
    require(x.time+config.granularity<=config.asof,"LQT: candle not closed at as-of");
    if(i){double dt=x.time-bars[i-1].time;require(dt>0,"LQT: candles must be ordered and unique");
     bool continuous=dt==config.granularity||(config.equity&&x.session!=bars[i-1].session&&
       dt<(config.granularity==86400?10:5)*86400);
     gaps[i]=gaps[i-1]+!continuous;
    }
   }
  }
  bool valid(std::size_t i,bool label)const{
   return i>=history+24&&(!label||i+config.horizon<bars.size())&&
    gaps[i]==gaps[i-history-23]&&(!label||gaps[i+config.horizon]==gaps[i]);
  }
  Example make(std::size_t i,bool label=true)const{
   require(valid(i,label),"LQT: insufficient continuous temporal context");
   Example e;e.origin=i;e.time=bars[i].time;e.reference=bars[i].close;e.angles.reserve(wires);
   double square=0,vol=0;
   for(std::size_t j=i-23;j<=i;j++){
    double r=std::log(bars[j].close/bars[j-1].close);square+=r*r;vol+=bars[j].volume;
   }
   e.return_scale=std::max(0.0001,std::sqrt(square/24*config.horizon));
   e.volatility_base=100*std::sqrt(square/24*config.horizon);
   e.volume_base=vol/24*config.horizon;
   for(std::size_t j=i-history+1;j<=i;j++){
    double average=0;for(std::size_t k=j-24;k<j;k++)average+=bars[k].volume/24;
    std::array<double,5> raw={std::log(bars[j].close/bars[j-1].close)/.005,
     std::log(bars[j].close/bars[j-3].close)/.01,
     std::log(bars[j].close/bars[j].open)/.005,
     (std::log(bars[j].high/bars[j].low)-.003)/.005,
     std::log((bars[j].volume+1e-6)/(average+1e-6))};
    for(double x:raw)e.angles.push_back(.65+.30*std::tanh(x));
   }
   if(label){
    double rv=0,v=0;for(std::size_t j=i+1;j<=i+config.horizon;j++){
     double r=std::log(bars[j].close/bars[j-1].close);rv+=r*r;v+=bars[j].volume;
    }
    e.actual={bars[i+config.horizon].close,100*std::sqrt(rv),v};
    e.target={std::log(e.actual[0]/e.reference)/e.return_scale,
     std::log((e.actual[1]+1e-6)/(e.volatility_base+1e-6)),
     std::log((e.actual[2]+1e-6)/(e.volume_base+1e-6)),double(e.actual[0]>e.reference)};
   }return e;
  }
  std::vector<Example> collect(std::size_t begin,std::size_t end,std::size_t cap)const{
   std::vector<Example> out;std::size_t step=config.horizon*std::max(std::size_t(1),
      (end-begin)/(std::size_t(config.horizon)*cap));
   for(std::size_t i=std::max(begin,history+24);i+config.horizon<end;i+=step)
    if(valid(i,true))out.push_back(make(i));
   if(out.size()>cap)out.resize(cap);
   return out;
  }
};
struct Metrics {
 std::size_t cases=0,direction_correct=0;double brier=0;
 std::size_t predicted_up=0,predicted_down=0,actual_up=0,probability_correct=0;
 double probability_min=1,probability_max=0,normalized_price_sd=0;
 std::array<double,3> mae{},baseline_mae{},coverage{};
};
struct Model {
 std::string asset;int granularity=300,horizon=3,lag=0;bool equity=false,quantum=true;
 std::vector<double> theta=std::vector<double>(wires),weights=std::vector<double>(wires*heads);
 // Training-only means of the two exact Heisenberg terms. Centering follows
 // theta analytically, so changing a rotation cannot reintroduce a DC bias.
 std::vector<double> mean_a=std::vector<double>(wires),mean_b=std::vector<double>(wires),scale=std::vector<double>(wires,1);
 static constexpr std::size_t parameters=wires*(heads+1)+heads;
 std::vector<double> adam_m=std::vector<double>(parameters),adam_v=std::vector<double>(parameters);
 std::array<double,heads> bias{};std::vector<std::uint64_t> changed=std::vector<std::uint64_t>(wires);
 std::array<double,3> lower{},upper{};double temperature=1,cursor=0,initial_through=0,readout_scale=root_n;
 std::size_t updates=0,initial_updates=0,validation_cases=0,calibration_cases=0;Metrics test;
 Model(){
  std::uint64_t rng=10292026;
  auto random=[&](){rng=(rng*48271)%2147483647;return double(rng)/2147483647-.5;};
  for(auto& x:theta)x=.70+.20*random();
  for(auto& x:weights)x=.02*random();
 }
 void prepare_inputs(const TemporalCircuit& c,const std::vector<Example>& train){
  require(!train.empty()&&updates==0,"LQT: normalization must precede learning");
  std::vector<double> sum_a(wires),sum_b(wires),a,b;
  std::fill(mean_a.begin(),mean_a.end(),0);std::fill(mean_b.begin(),mean_b.end(),0);
  std::size_t count=0;
  for(const auto& e:train){c.basis(e.angles,a,b,quantum);++count;
   for(std::size_t i=0;i<wires;i++){
    double da=a[i]-mean_a[i],db=b[i]-mean_b[i];mean_a[i]+=da/count;mean_b[i]+=db/count;
    sum_a[i]+=da*(a[i]-mean_a[i]);sum_b[i]+=db*(b[i]-mean_b[i]);
   }
  }
  std::size_t active=0;for(std::size_t i=0;i<wires;i++){
   double variance=(sum_a[i]+sum_b[i])/count;scale[i]=variance<1e-16?1:std::max(.001,std::sqrt(variance));active+=variance>=1e-16;
  }readout_scale=std::sqrt(double(std::max(std::size_t(1),active)));
 }
 std::array<double,heads> forward(const TemporalCircuit& c,const Example& e,
   std::vector<double>* observed=nullptr,std::vector<double>* derivative=nullptr)const{
  std::vector<double> local,a,b;auto& z=observed?*observed:local;c.basis(e.angles,a,b,quantum);
  z.resize(wires);if(derivative)derivative->resize(wires);
  for(std::size_t i=0;i<wires;i++){
   const double ca=(a[i]-mean_a[i])/scale[i],sb=(b[i]-mean_b[i])/scale[i],ct=std::cos(theta[i]),st=std::sin(theta[i]);
   z[i]=ct*ca-st*sb;if(derivative)(*derivative)[i]=-st*ca-ct*sb;
  }
  auto out=bias;for(std::size_t k=0;k<heads;k++)for(std::size_t i=0;i<wires;i++)out[k]+=weights[k*wires+i]*z[i]/readout_scale;
  return out;
 }
 void learn(const TemporalCircuit& c,const Example& e,double rate=1){
  std::vector<double> z,dz;auto prediction=forward(c,e,&z,&dz);std::array<double,heads> grad{};
  for(std::size_t k=0;k<3;k++)grad[k]=clip(prediction[k]-e.target[k],-1,1)/3;
  grad[3]=.25*(sigmoid(prediction[3])-e.target[3]);
  const double correction_m=1-std::pow(.9,double(updates+1)),correction_v=1-std::pow(.999,double(updates+1));
  auto adjust=[&](std::size_t at,double& value,double gradient,double step,double decay){
   gradient=clip(gradient,-1,1);adam_m[at]=.9*adam_m[at]+.1*gradient;adam_v[at]=.999*adam_v[at]+.001*gradient*gradient;
   value-=rate*step*((adam_m[at]/correction_m)/(std::sqrt(adam_v[at]/correction_v)+1e-6)+decay*value);
  };
  // The circuit uses PRE-UPDATE readouts; separate adaptive rates prevent the
  // small initial readout / sqrt(1000) from freezing every quantum rotation.
  for(std::size_t i=0;i<wires;i++){
   double g=0;for(std::size_t k=0;k<heads;k++)g+=grad[k]*weights[k*wires+i]/readout_scale;
   double data_gradient=g*dz[i],next=theta[i];adjust(i,next,data_gradient,.0025,0);
   next=clip(next,-3.141592653589793,3.141592653589793);
   if(next!=theta[i]&&std::abs(data_gradient)>1e-15)changed[i]++;
   theta[i]=next;
  }
  for(std::size_t k=0;k<heads;k++){
   for(std::size_t i=0;i<wires;i++)adjust(wires+k*wires+i,weights[k*wires+i],grad[k]*z[i]/readout_scale,.01,.01);
   adjust(wires*(heads+1)+k,bias[k],grad[k],.003,0);
  }updates++;
 }
 std::array<double,3> decode(const Example& e,const std::array<double,heads>& p)const{
  return {e.reference*std::exp(clip(p[0]*e.return_scale,-.5,.5)),
   std::max(0.,(e.volatility_base+1e-6)*std::exp(clip(p[1],-8,8))-1e-6),
   std::max(0.,(e.volume_base+1e-6)*std::exp(clip(p[2],-8,8))-1e-6)};
 }
 double validation_loss(const TemporalCircuit& c,const std::vector<Example>& examples)const{
  double sum=0;for(const auto& e:examples){auto p=forward(c,e);
   for(std::size_t k=0;k<3;k++)sum+=std::abs(p[k]-e.target[k])/3;
   double d=sigmoid(p[3])-e.target[3];sum+=.25*d*d;
  }return sum/examples.size();
 }
 Metrics evaluate(const TemporalCircuit& c,const std::vector<Example>& examples)const{
  Metrics m;m.cases=examples.size();require(m.cases>0,"LQT: empty evaluation");
  double mean=0,squared=0;std::size_t count=0;
  for(const auto& e:examples){auto p=forward(c,e);auto y=decode(e,p);std::array<double,3> base={e.reference,e.volatility_base,e.volume_base};
   m.direction_correct+=((y[0]>e.reference)==(e.actual[0]>e.reference))&&y[0]!=e.reference&&e.actual[0]!=e.reference;
   double probability=sigmoid(p[3]/temperature),b=probability-e.target[3];m.brier+=b*b/m.cases;
   m.predicted_up+=y[0]>e.reference;m.predicted_down+=y[0]<e.reference;m.actual_up+=e.target[3]>0;
   m.probability_correct+=(probability>.5)==(e.target[3]>0);
   m.probability_min=std::min(m.probability_min,probability);m.probability_max=std::max(m.probability_max,probability);
   ++count;double delta=p[0]-mean;mean+=delta/count;squared+=delta*(p[0]-mean);
   for(std::size_t k=0;k<3;k++){
    m.mae[k]+=std::abs(y[k]-e.actual[k])/m.cases;m.baseline_mae[k]+=std::abs(base[k]-e.actual[k])/m.cases;
    m.coverage[k]+=(e.target[k]>=p[k]+lower[k]&&e.target[k]<=p[k]+upper[k])?1./m.cases:0;
   }
  }m.normalized_price_sd=std::sqrt(std::max(0.,squared/m.cases));return m;
 }
 std::string save()const{
  std::ostringstream o;o<<std::setprecision(17)<<"LQT2 2 "<<asset<<' '<<granularity<<' '<<horizon<<' '<<equity<<' '<<quantum<<' '<<lag<<'\n';
  o<<updates<<' '<<initial_updates<<' '<<validation_cases<<' '<<calibration_cases<<' '<<cursor<<' '<<initial_through<<' '<<temperature<<' '<<readout_scale<<'\n';
  auto array=[&](const auto& values){for(auto x:values)o<<x<<' ';o<<'\n';};
  array(theta);array(weights);array(bias);array(changed);array(lower);array(upper);
  array(mean_a);array(mean_b);array(scale);array(adam_m);array(adam_v);
  o<<test.cases<<' '<<test.direction_correct<<' '<<test.brier<<' '<<test.predicted_up<<' '<<test.predicted_down<<' '<<test.actual_up<<' '<<test.probability_correct<<' '<<test.probability_min<<' '<<test.probability_max<<' '<<test.normalized_price_sd<<'\n';
  array(test.mae);array(test.baseline_mae);array(test.coverage);return o.str();
 }
 static Model restore(const std::string& saved,const Config& c,bool mode){
  require(saved.size()<768*1024,"LQT: checkpoint exceeds limit");std::istringstream in(saved);Model m;std::string magic;int version,eq,q;
  in>>magic>>version>>m.asset>>m.granularity>>m.horizon>>eq>>q>>m.lag;
  require(magic=="LQT2"&&version==2&&eq>=0&&eq<=1&&q>=0&&q<=1,"LQT: checkpoint version; original LQT1 learning is preserved separately");m.equity=eq;m.quantum=q;
  require(m.asset==c.asset&&m.granularity==c.granularity&&m.horizon==c.horizon&&m.equity==c.equity&&m.quantum==mode,"LQT: checkpoint context mismatch");
  require(m.lag==0||m.lag==3||m.lag==12,"LQT: checkpoint topology");
  in>>m.updates>>m.initial_updates>>m.validation_cases>>m.calibration_cases>>m.cursor>>m.initial_through>>m.temperature>>m.readout_scale;
  auto array=[&](auto& values){for(auto& x:values){in>>x;require(bool(in)&&std::isfinite(double(x)),"LQT: malformed checkpoint");}};
  array(m.theta);array(m.weights);array(m.bias);array(m.changed);array(m.lower);array(m.upper);
  array(m.mean_a);array(m.mean_b);array(m.scale);array(m.adam_m);array(m.adam_v);
  in>>m.test.cases>>m.test.direction_correct>>m.test.brier>>m.test.predicted_up>>m.test.predicted_down>>m.test.actual_up>>m.test.probability_correct>>m.test.probability_min>>m.test.probability_max>>m.test.normalized_price_sd;
  array(m.test.mae);array(m.test.baseline_mae);array(m.test.coverage);
  std::string trailing;require(bool(in)&&!(in>>trailing),"LQT: trailing checkpoint content");
  require(m.updates>0&&m.updates<=10000000&&m.initial_updates<=m.updates&&m.validation_cases>=8&&m.calibration_cases>=12&&m.test.cases>=8&&m.test.cases<=64&&m.test.direction_correct<=m.test.cases,"LQT: checkpoint counts");
  require(std::isfinite(m.cursor)&&std::isfinite(m.initial_through)&&m.cursor>0&&m.initial_through>0&&m.initial_through<=c.asof&&m.cursor<c.asof&&m.temperature>=.5&&m.temperature<=4&&m.test.brier>=0&&m.test.brier<=1,"LQT: checkpoint time or calibration");
  for(auto x:m.theta)require(std::abs(x)<=3.141592653589794,"LQT: checkpoint rotation");
  for(auto x:m.weights)require(std::abs(x)<100,"LQT: checkpoint weight");
  for(auto x:m.bias)require(std::abs(x)<100,"LQT: checkpoint bias");
  require(m.readout_scale>=1&&m.readout_scale<=root_n+.00000001,"LQT: checkpoint active input count");
  for(auto x:m.changed)require(x<=m.updates,"LQT: rotation update count");
  for(std::size_t i=0;i<wires;i++)require(std::abs(m.mean_a[i])<=1&&std::abs(m.mean_b[i])<=1&&m.scale[i]>=.001&&m.scale[i]<=2,"LQT: checkpoint training normalization");
  for(std::size_t i=0;i<parameters;i++)require(std::abs(m.adam_m[i])<=1.0000001&&m.adam_v[i]>=0&&m.adam_v[i]<=1.0000001,"LQT: checkpoint optimizer");
  require(m.test.predicted_up<=m.test.cases&&m.test.predicted_down<=m.test.cases&&m.test.predicted_up+m.test.predicted_down<=m.test.cases&&m.test.actual_up<=m.test.cases&&m.test.probability_correct<=m.test.cases&&
   std::isfinite(m.test.probability_min)&&std::isfinite(m.test.probability_max)&&m.test.probability_min>0&&m.test.probability_max<1&&m.test.probability_min<=m.test.probability_max&&std::isfinite(m.test.normalized_price_sd)&&m.test.normalized_price_sd>=0,"LQT: checkpoint response diagnostics");
  for(std::size_t k=0;k<3;k++)require(m.lower[k]<=m.upper[k]&&m.test.mae[k]>=0&&m.test.baseline_mae[k]>=0&&m.test.coverage[k]>=0&&m.test.coverage[k]<=1.000000001,"LQT: checkpoint metric");
  return m;
 }
};

inline Model fit_candidate(const Dataset& d,const TemporalCircuit& circuit,bool quantum=true){
 const auto n=d.bars.size();auto train=d.collect(0,n*60/100,512),val=d.collect(n*60/100,n*75/100,64);
 require(train.size()>=64&&val.size()>=8,"LQT: insufficient mature train/validation cases for this horizon");
 Model current;current.asset=d.config.asset;current.granularity=d.config.granularity;current.horizon=d.config.horizon;current.equity=d.config.equity;current.quantum=quantum;current.lag=circuit.lag();
 current.prepare_inputs(circuit,train);
 Model best=current;double best_loss=std::numeric_limits<double>::infinity();
 // All candidate epochs are fixed before the later calibration/test blocks.
 std::vector<std::size_t> order(train.size());std::iota(order.begin(),order.end(),0);std::mt19937 shuffle(10292026);
 int stale=0;for(int epoch=0;epoch<24;epoch++){
  std::shuffle(order.begin(),order.end(),shuffle);for(auto i:order)current.learn(circuit,train[i]);
  const double loss=current.validation_loss(circuit,val);
  if(loss<best_loss-1e-8){best_loss=loss;best=current;stale=0;}else stale++;
  if(epoch>=3&&stale>=4)break;
 }
 double best_brier=std::numeric_limits<double>::infinity();
 for(double temperature:{.5,1.,2.,4.}){
  double score=0;for(const auto& e:val){double p=sigmoid(best.forward(circuit,e)[3]/temperature)-e.target[3];score+=p*p;}
  if(score<best_brier){best_brier=score;best.temperature=temperature;}
 }
 best.validation_cases=val.size();return best;
}
inline void calibrate_and_test(Model& best,const Dataset& d,const TemporalCircuit& circuit){
 const auto n=d.bars.size();auto calibration=d.collect(n*75/100,n*85/100,64),test=d.collect(n*85/100,n,64);
 require(calibration.size()>=12&&test.size()>=8,"LQT: insufficient independent calibration/test cases for this horizon");
 std::array<std::vector<double>,3> residuals;
 for(const auto& e:calibration){auto p=best.forward(circuit,e);for(std::size_t k=0;k<3;k++)residuals[k].push_back(e.target[k]-p[k]);}
 for(std::size_t k=0;k<3;k++){best.lower[k]=quantile(residuals[k],.1);best.upper[k]=quantile(residuals[k],.9);}
 best.calibration_cases=calibration.size();best.test=best.evaluate(circuit,test);
 best.initial_updates=best.updates;best.initial_through=d.bars.back().time+d.config.granularity;
 // Only origins at/after the first published origin can train subsequently.
 // Initial held-out blocks are never silently recycled into online learning.
 best.cursor=d.bars.back().time-d.config.horizon*d.config.granularity;
}
inline std::size_t continue_learning(Model& m,const Dataset& d,const TemporalCircuit& c){
 const auto before=m.updates;
 require(d.bars.back().time+d.config.granularity>=m.initial_through,"LQT: history older than checkpoint");
 for(std::size_t i=history+24;i+d.config.horizon<d.bars.size();i++){
  if(d.bars[i].time<m.cursor+d.config.horizon*d.config.granularity||!d.valid(i,true))continue;
  require(d.bars[i].time+d.config.granularity>=m.initial_through,"LQT: held-out history cannot enter online learning");
  m.learn(c,d.make(i),.25);m.cursor=d.bars[i].time;
 }
 return m.updates-before;
}
inline std::string metrics_json(const Metrics& m){
 std::ostringstream o;o<<std::setprecision(17)<<"{\"cases\":"<<m.cases<<",\"directionCorrect\":"<<m.direction_correct<<",\"brier\":"<<m.brier
  <<",\"predictedUp\":"<<m.predicted_up<<",\"predictedDown\":"<<m.predicted_down<<",\"actualUp\":"<<m.actual_up<<",\"probabilityCorrect\":"<<m.probability_correct
  <<",\"probabilityMin\":"<<m.probability_min<<",\"probabilityMax\":"<<m.probability_max<<",\"normalizedPriceSD\":"<<m.normalized_price_sd<<",\"outputs\":[";
 for(std::size_t k=0;k<3;k++){if(k)o<<',';o<<"{\"mae\":"<<m.mae[k]<<",\"baselineMAE\":"<<m.baseline_mae[k]<<",\"intervalCoverage\":"<<m.coverage[k]<<'}';}o<<"]}";return o.str();
}

// Namespaced XI extension for the new bounded Ether representation. Candle
// serialization/checkpoint storage are host work; targets, circuit inference,
// optimizer, chronology and calibration are executed here in native code.
class TemporalXiRuntime {
 public:
 std::string execute(const std::string& program,const std::string& checkpoint="")const{
  require(program.size()<=2*1024*1024,"LQT: XI program exceeds 2 MiB");
  Config config;std::vector<Candle> rows;std::istringstream source(program);std::string line;bool configured=false,run=false,quantum=true;int seen=0;
  while(std::getline(source,line)){
   if(line.empty()||line[0]=='#')continue;
   require(!run,"LQT: command after run");
   std::istringstream in(line);std::string op;in>>op;
   if(op=="lqt.configure"){
    std::string market,mode;require(!configured&&rows.empty(),"LQT: duplicate configuration");
    in>>config.asset>>config.granularity>>config.horizon>>market>>config.asof>>mode;
    require(bool(in)&&(market=="crypto"||market=="equity")&&(mode=="quantum"||mode=="classical"),"LQT: invalid configuration");
    config.equity=market=="equity";quantum=mode=="quantum";configured=true;
   }else if(op=="lqt.candle"){
    require(configured&&rows.size()<8640,"LQT: candle before configuration or limit");Candle x;
    in>>x.time>>x.low>>x.high>>x.open>>x.close>>x.volume>>x.session;require(bool(in),"LQT: malformed candle instruction");rows.push_back(x);
   }else if(op=="lqt.run"){require(configured,"LQT: missing configuration");run=true;seen++;}
   else throw std::invalid_argument("LQT: unknown XI extension instruction");
   std::string rest;require(!(in>>rest),"LQT: trailing XI arguments");
  }
  require(run&&seen==1,"LQT: missing run instruction");
  auto started=std::chrono::steady_clock::now();Dataset data(config,std::move(rows));
  const auto& last=data.bars.back();
  require(last.time+config.granularity+config.horizon*config.granularity>config.asof,"LQT: future period already expired; refresh candles");
  Model model;
  if(checkpoint.empty()){
   double selected_loss=std::numeric_limits<double>::infinity();
   auto validation=data.collect(data.bars.size()*60/100,data.bars.size()*75/100,64);
   for(int lag:{0,3,12}){
    TemporalCircuit candidate_circuit(wires,channels,lag);auto candidate=fit_candidate(data,candidate_circuit,quantum);
    double loss=candidate.validation_loss(candidate_circuit,validation);
    if(loss<selected_loss){selected_loss=loss;model=std::move(candidate);}
   }
  }else model=Model::restore(checkpoint,config,quantum);
  TemporalCircuit circuit(wires,channels,model.lag);
  if(checkpoint.empty())calibrate_and_test(model,data,circuit);
  std::size_t online=checkpoint.empty()?0:continue_learning(model,data,circuit);
  auto now=data.make(data.bars.size()-1,false);auto p=model.forward(circuit,now);auto values=model.decode(now,p);
  std::size_t trained=std::count_if(model.changed.begin(),model.changed.end(),[](auto x){return x>0;});
  double elapsed=std::chrono::duration<double,std::milli>(std::chrono::steady_clock::now()-started).count();
  std::ostringstream out;out<<std::setprecision(17);
  out<<"{\"schema\":\"laplace-lqt1000-v1\",\"model\":\"LQT-1000\",\"asset\":"<<quoted(config.asset)
   <<",\"market\":"<<quoted(config.equity?"equity":"crypto")<<",\"granularity\":"<<config.granularity<<",\"horizonBars\":"<<config.horizon
   <<",\"sourceCloseAt\":"<<last.time+config.granularity<<",\"originTime\":"<<last.time<<",\"reference\":"<<last.close
   <<",\"targetCloseAt\":"<<(config.equity?"null":std::to_string(std::int64_t(last.time+config.granularity*(config.horizon+1))))
   <<",\"qubits\":1000,\"components\":"<<(quantum?1:1000)<<",\"graphEdges\":"<<(quantum?circuit.edges():0)<<",\"selectedTemporalLag\":"<<model.lag<<",\"trainableRotations\":1000,\"updatedRotations\":"<<trained
   <<",\"updates\":"<<model.updates<<",\"onlineUpdates\":"<<online<<",\"quantum\":"<<(quantum?"true":"false")
   <<",\"nativeXI\":true,\"algorithmVersion\":2,\"representation\":\"exact rotated-product graph / centered Heisenberg observables\",\"mps\":false,\"physicalQPU\":false"
   <<",\"circuitPayloadBytes\":"<<circuit.payload_bytes()+2*wires*sizeof(double)<<",\"nativeMilliseconds\":"<<elapsed
   <<",\"initialTestThrough\":"<<model.initial_through<<",\"initialUpdates\":"<<model.initial_updates
   <<",\"validationCases\":"<<model.validation_cases<<",\"calibrationCases\":"<<model.calibration_cases
   <<",\"test\":"<<metrics_json(model.test)<<",\"probabilityUp\":"<<sigmoid(p[3]/model.temperature)<<",\"outputs\":[";
  const std::array<double,3> base={now.reference,now.volatility_base,now.volume_base};
  for(std::size_t k=0;k<3;k++){
   if(k)out<<',';
   auto lo=p,hi=p;lo[k]+=model.lower[k];hi[k]+=model.upper[k];
   out<<"{\"predicted\":"<<values[k]<<",\"baseline\":"<<base[k]<<",\"lower\":"<<model.decode(now,lo)[k]<<",\"upper\":"<<model.decode(now,hi)[k]<<'}';
  }
  out<<"],\"checkpoint\":"<<quoted(model.save())<<",\"automaticTrading\":false,\"prospectivelyValidated\":false}";return out.str();
 }
};
}} // namespace mundo_x::laplace
