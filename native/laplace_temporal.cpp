// Domain operations layered on the UNMODIFIED original QuantumRuntime.
// Markov counting/propagation are classical native arithmetic, not quantum gates.
// Evidence, learned integer counts and every propagated state live in the
// original InverseMemory. Standard XI blocks are delegated verbatim.
#include "mundo_x/quantum_runtime.hpp"
#include <algorithm>
#include <cmath>
#include <cstring>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <map>
#include <numeric>
#include <sstream>
#include <stdexcept>
#include <vector>

namespace {
using Runtime=mundo_x::QuantumRuntime;
using Bytes=std::vector<std::uint8_t>;
constexpr std::uint64_t MODEL=2000000,STATE=3000000;
constexpr std::size_t MAX_STATES=16,MAX_ROWS=256;
void require(bool ok,const char* message){if(!ok)throw std::runtime_error(message);}
std::uint32_t integer(const std::string& raw){
  return mundo_x::infinite_program_detail::decimal<std::uint32_t>(raw,"Laplace integer");
}
void put(Bytes& out,std::uint64_t value,unsigned size){for(unsigned i=0;i<size;i++)out.push_back(static_cast<std::uint8_t>(value>>(i*8)));}
std::uint64_t get(const Bytes& in,std::size_t& at,unsigned size){
  require(at+size<=in.size(),"truncated temporal memory");std::uint64_t value=0;
  for(unsigned i=0;i<size;i++)value|=std::uint64_t(in[at++])<<(8*i);
  return value;
}
std::uint64_t checksum(const Bytes& bytes){
  std::uint64_t hash=14695981039346656037ULL;for(const auto byte:bytes){hash^=byte;hash*=1099511628211ULL;}return hash;
}
Bytes read(const Runtime& runtime,std::uint64_t address,std::size_t size){
  return runtime.memory().materialize(std::to_string(address),size,runtime.core());
}
void store(Runtime& runtime,std::uint64_t address,const Bytes& bytes){
  std::ostringstream xi;for(std::size_t i=0;i<bytes.size();i++)xi<<"mem_store "<<address+i<<' '<<unsigned(bytes[i])<<'\n';
  runtime.execute(xi.str());require(read(runtime,address,bytes.size())==bytes,"native memory roundtrip failed");
}
struct Model{
  std::vector<std::uint16_t> masks;
  std::vector<std::uint32_t> visits,n,s,transitions;
  std::uint32_t rows=0,labels=0,positives=0,alpha=0,strength=8;
};
Bytes encode(const Model& m){
  Bytes b;put(b,0x4c505436,4);put(b,m.masks.size(),4);put(b,m.rows,4);put(b,m.labels,4);put(b,m.positives,4);put(b,m.alpha,4);put(b,m.strength,4);
  for(std::size_t i=0;i<m.masks.size();i++){put(b,m.masks[i],2);put(b,m.visits[i],4);put(b,m.n[i],4);put(b,m.s[i],4);}
  for(auto count:m.transitions)put(b,count,4);
  return b;
}
void save_model(Runtime& runtime,const Model& model){
  const auto payload=encode(model);Bytes blob;put(blob,payload.size(),4);blob.insert(blob.end(),payload.begin(),payload.end());put(blob,checksum(payload),8);store(runtime,MODEL,blob);
}
Model load_model(const Runtime& runtime){
  std::size_t p=0;const auto header=read(runtime,MODEL,4);const auto size=get(header,p,4);
  require(size>=28&&size<=4096,"missing or oversized learned temporal model");
  const auto blob=read(runtime,MODEL+4,size+8);Bytes payload(blob.begin(),blob.begin()+size);p=size;
  require(get(blob,p,8)==checksum(payload),"learned temporal memory checksum mismatch");p=0;
  require(get(payload,p,4)==0x4c505436,"incompatible temporal memory");const auto k=get(payload,p,4);
  require(k>=1&&k<=MAX_STATES,"too many temporal states");Model m;
  m.rows=get(payload,p,4);m.labels=get(payload,p,4);m.positives=get(payload,p,4);m.alpha=get(payload,p,4);m.strength=get(payload,p,4);
  require(m.rows<=MAX_ROWS&&m.labels<=m.rows&&m.positives<=m.labels&&m.alpha<=64&&m.strength>=1&&m.strength<=64,"invalid learned counts");
  for(std::size_t i=0;i<k;i++){
    m.masks.push_back(get(payload,p,2));m.visits.push_back(get(payload,p,4));m.n.push_back(get(payload,p,4));m.s.push_back(get(payload,p,4));
    require(m.masks.back()<2048&&m.s.back()<=m.n.back()&&m.n.back()<=m.visits.back(),"invalid learned state counts");
    require(i==0||m.masks[i]>m.masks[i-1],"unordered temporal states");
  }
  for(std::size_t i=0;i<k*k;i++)m.transitions.push_back(get(payload,p,4));
  require(p==payload.size()&&std::accumulate(m.visits.begin(),m.visits.end(),0U)==m.rows&&
    std::accumulate(m.n.begin(),m.n.end(),0U)==m.labels&&std::accumulate(m.s.begin(),m.s.end(),0U)==m.positives,"inconsistent temporal model");return m;
}
std::vector<double> reference(const Model& m){
  std::vector<double> out;for(auto n:m.visits)out.push_back(double(n+1)/double(m.rows+m.masks.size()));return out;
}
std::vector<double> matrix(const Model& m){
  const auto base=reference(m);const auto k=m.masks.size();std::vector<double> out(k*k);
  for(std::size_t i=0;i<k;i++){
    const auto n=std::accumulate(m.transitions.begin()+i*k,m.transitions.begin()+(i+1)*k,0U);
    for(std::size_t j=0;j<k;j++)out[i*k+j]=n+m.alpha?double(m.transitions[i*k+j]+m.alpha*base[j])/double(n+m.alpha):base[j];
  }return out;
}
double prior(const Model& m){return double(m.positives+1)/double(m.labels+2);}
std::vector<double> emissions(const Model& m){
  std::vector<double> out;for(std::size_t i=0;i<m.masks.size();i++)out.push_back((m.s[i]+m.strength*prior(m))/(m.n[i]+double(m.strength)));return out;
}
template<class T>void array(std::ostream& out,const std::vector<T>& data){out<<'[';for(std::size_t i=0;i<data.size();i++){if(i)out<<',';out<<data[i];}out<<']';}
void report(std::ostream& out,const Runtime& runtime){
  const auto m=load_model(runtime);out<<"{\"type\":\"temporal_model\",\"backend\":\"original-inverse-ether-memory\",\"arithmetic\":\"native-classical\",\"state_masks\":";array(out,m.masks);
  out<<",\"visits\":";array(out,m.visits);out<<",\"label_counts\":";array(out,m.n);out<<",\"positive_counts\":";array(out,m.s);
  out<<",\"transition_counts\":";array(out,m.transitions);out<<",\"transition_matrix\":";array(out,matrix(m));
  out<<",\"emissions\":";array(out,emissions(m));out<<",\"state_reference\":";array(out,reference(m));
  out<<",\"samples\":"<<m.rows<<",\"labels\":"<<m.labels<<",\"alpha\":"<<m.alpha<<",\"prior_strength\":"<<m.strength<<",\"training_prior\":"<<prior(m)<<",\"checksum\":\""<<checksum(encode(m))<<"\"}\n";
}
void fit(Runtime& runtime,std::uint64_t address,std::size_t count,unsigned alpha,unsigned strength){
  require(count>=1&&count<=MAX_ROWS&&alpha<=64&&strength>=1&&strength<=64,"temporal fit exceeds budget");
  const auto bytes=read(runtime,address,count*4);std::vector<std::uint16_t> masks;std::vector<unsigned> labels,links;std::map<std::uint16_t,std::size_t> index;std::size_t p=0;
  for(std::size_t row=0;row<count;row++){
    const auto mask=get(bytes,p,2),label=get(bytes,p,1),link=get(bytes,p,1);
    require((mask<2048||mask==65535)&&label<=2&&link<=1,"invalid temporal training record");
    require(row+1<count||link==0,"last training record cannot link to the future");
    masks.push_back(mask);labels.push_back(label);links.push_back(link);if(mask!=65535)index.emplace(mask,0);
  }
  require(!index.empty()&&index.size()<=MAX_STATES,"temporal vocabulary missing or exceeds 16 states");
  Model m;m.alpha=alpha;m.strength=strength;std::size_t next=0;
  for(auto& item:index){item.second=next++;m.masks.push_back(item.first);}
  const auto k=index.size();m.visits.assign(k,0);m.n.assign(k,0);m.s.assign(k,0);m.transitions.assign(k*k,0);
  for(std::size_t row=0;row<count;row++){
    if(masks[row]==65535)continue;
    const auto i=index.at(masks[row]);m.visits[i]++;m.rows++;
    if(labels[row]<2){m.n[i]++;m.s[i]+=labels[row];m.labels++;m.positives+=labels[row];}
    if(links[row]&&row+1<count&&masks[row+1]!=65535)m.transitions[i*k+index.at(masks[row+1])]++;
  }
  save_model(runtime,m);load_model(runtime);
}
void write_state(Runtime& runtime,const std::vector<double>& distribution){
  Bytes bytes;for(double value:distribution){std::uint64_t bits=0;static_assert(sizeof(bits)==sizeof(value));std::memcpy(&bits,&value,sizeof(value));put(bytes,bits,8);}store(runtime,STATE,bytes);
}
std::vector<double> read_state(const Runtime& runtime,std::size_t k){
  const auto bytes=read(runtime,STATE,k*8);std::vector<double> out;std::size_t at=0;
  for(std::size_t i=0;i<k;i++){const auto bits=get(bytes,at,8);double value=0;std::memcpy(&value,&bits,sizeof(value));require(std::isfinite(value)&&value>=0&&value<=1+1e-10,"invalid propagated memory state");out.push_back(value);}
  require(std::abs(std::accumulate(out.begin(),out.end(),0.0)-1)<1e-9,"temporal probability mass not conserved");return out;
}
void evolve(Runtime& runtime,unsigned mask,unsigned steps,std::ostream& out){
  require(mask<2048,"invalid temporal narrative mask");const auto m=load_model(runtime);const auto k=m.masks.size();
  const auto found=std::find(m.masks.begin(),m.masks.end(),mask);
  if(found==m.masks.end()){out<<"{\"type\":\"temporal_evolution\",\"initial_mask\":"<<mask<<",\"status\":\"abstencion_estado_no_observado\",\"trace\":[]}\n";return;}
  std::vector<double> initial(k,0);initial[found-m.masks.begin()]=1;write_state(runtime,initial);
  const auto transition=matrix(m),emit=emissions(m);
  out<<"{\"type\":\"temporal_evolution\",\"initial_mask\":"<<mask<<",\"status\":\"evolucion_nativa_calculada\",\"arithmetic\":\"native-classical\",\"state_memory_address\":"<<STATE<<",\"trace\":[";
  for(std::uint64_t step=0;step<=steps;step++){
    const auto distribution=read_state(runtime,k);if(step)out<<',';
    out<<"{\"step\":"<<step<<",\"probability\":";
    if(m.labels){
      const auto positive=std::inner_product(distribution.begin(),distribution.end(),emit.begin(),0.0);
      out<<positive<<",\"negative_probability\":"<<1-positive;
    }else out<<"null,\"negative_probability\":null";
    out<<",\"distribution\":";array(out,distribution);out<<'}';
    require(out.tellp()<=8*1024*1024,"Laplace response exceeds budget");
    if(step<steps){std::vector<double> next(k,0);for(std::size_t i=0;i<k;i++)for(std::size_t j=0;j<k;j++)next[j]+=distribution[i]*transition[i*k+j];write_state(runtime,next);}
  }out<<"],\"model_checksum\":\""<<checksum(encode(m))<<"\"}\n";
}
void execute(const std::string& program){
  require(program.size()<=2*1024*1024,"Laplace program exceeds 2 MiB");Runtime runtime;std::istringstream input(program);std::ostringstream output;output<<std::setprecision(17);
  std::string line,xi;std::size_t commands=0;
  const auto flush=[&](){if(!xi.empty()){
    const auto result=runtime.execute(xi);
    require(static_cast<std::size_t>(output.tellp())+result.size()<=8*1024*1024,"Laplace response exceeds budget");
    output<<result;xi.clear();
  }};
  while(std::getline(input,line)){
    require(++commands<=40000,"Laplace command budget exceeded");const auto words=mundo_x::infinite_program_detail::tokens(line);if(words.empty())continue;
    if(words[0].rfind("laplace_",0)!=0){xi+=line+'\n';continue;}flush();
    if(words[0]=="laplace_fit"){
      require(words.size()==5,"laplace_fit ADDRESS COUNT ALPHA PRIOR_STRENGTH");fit(runtime,integer(words[1]),integer(words[2]),integer(words[3]),integer(words[4]));
    }else if(words[0]=="laplace_report"){
      require(words.size()==1,"laplace_report takes no arguments");report(output,runtime);
    }else if(words[0]=="laplace_evolve"){
      require(words.size()==3,"laplace_evolve MASK STEPS");evolve(runtime,integer(words[1]),integer(words[2]),output);
    }else throw std::runtime_error("unknown Laplace domain operation");
    require(output.tellp()<=8*1024*1024,"Laplace response exceeds budget");
  }flush();std::cout<<output.str();
}
std::string bounded_program(std::istream& stream){
  std::string out;char buffer[4096];
  while(stream.read(buffer,sizeof(buffer))||stream.gcount()){
    require(out.size()+static_cast<std::size_t>(stream.gcount())<=2*1024*1024,"Laplace program exceeds 2 MiB");
    out.append(buffer,static_cast<std::size_t>(stream.gcount()));
  }
  require(!stream.bad(),"failed to read Laplace program");return out;
}
}
int main(int argc,char** argv){
  try{
    std::string program;if(argc==1||(argc==2&&std::string(argv[1])=="-"))program=bounded_program(std::cin);
    else if(argc==2){std::ifstream file(argv[1],std::ios::binary);require(bool(file),"cannot open Laplace program");program=bounded_program(file);}
    else throw std::runtime_error("usage: laplace_temporal [program.xi|-]");
    execute(program);return 0;
  }catch(const std::exception& error){std::cerr<<"Laplace temporal: "<<error.what()<<'\n';return 1;}
}
