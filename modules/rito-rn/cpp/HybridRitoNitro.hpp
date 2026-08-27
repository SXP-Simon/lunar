#pragma once

#include "HybridRitoNitroSpec.hpp"
#include "RitoExecutor.h"

namespace margelo::nitro::ritonitro {

class HybridRitoNitro final : public HybridRitoNitroSpec {
 public:
  HybridRitoNitro();
  ~HybridRitoNitro() override;

  std::shared_ptr<Promise<RitoNitroResult>> open(const std::shared_ptr<ArrayBuffer>& publication, const std::shared_ptr<ArrayBuffer>& request, const std::vector<RitoNitroPinnedFontFace>& fonts) override;
  std::shared_ptr<Promise<RitoNitroResult>> readPublication(const std::string& sessionId) override;
  std::shared_ptr<Promise<RitoNitroResult>> requestArtifact(const std::string& sessionId, const std::shared_ptr<ArrayBuffer>& request) override;
  std::shared_ptr<Promise<RitoNitroResult>> requestAdjacent(const std::string& sessionId, const std::shared_ptr<ArrayBuffer>& request) override;
  std::shared_ptr<Promise<RitoNitroResult>> peekAdjacent(const std::string& sessionId, const std::shared_ptr<ArrayBuffer>& request) override;
  std::shared_ptr<Promise<RitoNitroResult>> adoptForeground(const std::string& sessionId, const std::shared_ptr<ArrayBuffer>& request) override;
  std::shared_ptr<Promise<RitoNitroResult>> commitPeekedArtifact(const std::string& sessionId, const std::shared_ptr<ArrayBuffer>& request) override;
  std::shared_ptr<Promise<RitoNitroResult>> advanceBackground(const std::string& sessionId, const std::shared_ptr<ArrayBuffer>& request) override;
  std::shared_ptr<Promise<RitoNitroResult>> adoptBackground(const std::string& sessionId, const std::shared_ptr<ArrayBuffer>& request) override;
  std::shared_ptr<Promise<RitoNitroResult>> readResource(const std::string& sessionId, const std::string& artifactId, double kind, const std::string& href) override;
  std::shared_ptr<Promise<RitoNitroResult>> search(const std::string& sessionId, const std::shared_ptr<ArrayBuffer>& request) override;
  std::shared_ptr<Promise<RitoNitroResult>> textRangeGeometry(const std::string& sessionId, const std::shared_ptr<ArrayBuffer>& request) override;
  std::shared_ptr<Promise<RitoNitroResult>> readFootnote(const std::string& sessionId, const std::string& artifactId, const std::string& key) override;
  std::shared_ptr<Promise<RitoNitroResult>> releaseArtifact(const std::string& sessionId, const std::string& artifactId) override;
  std::shared_ptr<Promise<RitoNitroResult>> disposeSession(const std::string& sessionId) override;

 private:
  ritojs::reactnative::RitoExecutor executor_;
};

}  // namespace margelo::nitro::ritonitro
